import { prisma } from '../config/prisma.js';
import type { PeriodoMateria } from '@prisma/client';
import { ROLES } from '../constants/roles.js';
import { AppError } from '../utils/AppError.js';
import { normalizePagination, paginated } from '../utils/pagination.js';
import { anioInstitucionalActual } from '../utils/cicloLectivo.js';

type ComponenteInput = { materiaId: number; docenteId?: number | null; periodo?: PeriodoMateria };
type CreateInput = { espacioCurricularId: number; anioLectivo: number; periodo?: PeriodoMateria; componentes: ComponenteInput[] };
type UpdateInput = { activo?: boolean; componentes?: Array<{ materiaId: number; docenteId?: number | null; periodo?: PeriodoMateria }> };

const ofertaInclude = {
  espacioCurricular: { include: { carrera: { select: { id: true, nombre: true } } } },
  componentes: {
    include: {
      materia: { include: { carrera: { select: { id: true, nombre: true } } } },
      docente: { select: { idUsuario: true, apellidoNombre: true, email: true } }
    },
    orderBy: [{ materia: { nombre: 'asc' as const } }, { id: 'asc' as const }]
  }
};

function presentar(oferta: any) {
  const estadoCursada = oferta.anioLectivo < anioInstitucionalActual()
    ? 'FINALIZADA'
    : oferta.activo ? 'ACTIVA' : 'INACTIVA';
  return {
    id: oferta.id,
    cursadaEspacioId: oferta.id,
    espacioCurricularId: oferta.espacioCurricularId,
    espacioCurricular: oferta.espacioCurricular,
    anioLectivo: oferta.anioLectivo,
    estadoCursada,
    periodo: oferta.periodo,
    activo: oferta.activo,
    componentes: oferta.componentes.map((cursada: any) => ({
      cursadaId: cursada.id,
      materiaId: cursada.materiaId,
      materia: cursada.materia,
      docenteId: cursada.docenteId,
      docente: cursada.docente,
      anioLectivo: cursada.anioLectivo,
      periodo: cursada.periodo
    }))
  };
}

function mapConflict(error: unknown): never {
  if ((error as any)?.code === 'P2002') throw new AppError(409, 'Ya existe una cursada del espacio con esos datos');
  throw error;
}

class CursadaEspacioService {
  private requireAdmin(user: any): void {
    if (user?.rol !== ROLES.ADMINISTRATIVO) throw new AppError(403, 'Solo administrativos pueden gestionar cursadas de espacios');
  }

  async create(input: CreateInput, currentUser: any) {
    this.requireAdmin(currentUser);
    try {
      const id = await prisma.$transaction(async (tx) => {
        const initial = await tx.espacioCurricular.findUnique({
          where: { id: input.espacioCurricularId }, select: { carreraId: true }
        });
        if (!initial?.carreraId) throw new AppError(404, 'Espacio curricular o carrera no encontrado');
        await tx.$queryRaw`SELECT id FROM carreras WHERE id = ${initial.carreraId} FOR UPDATE`;
        const space = await tx.espacioCurricular.findUnique({
          where: { id: input.espacioCurricularId },
          include: { materias: { select: { id: true, nombre: true, carreraId: true, activo: true, periodo: true } } }
        });
        if (!space?.activo || !space.carreraId) throw new AppError(409, 'El espacio debe estar activo y tener carrera asignada');
        if (space.carreraId !== initial.carreraId) throw new AppError(409, 'La carrera del espacio cambió durante la operación');
        if (space.materias.length < 2) throw new AppError(409, 'El espacio necesita al menos dos materias activas');
        if (input.componentes.length !== space.materias.length
          || new Set(input.componentes.map((item) => item.materiaId)).size !== input.componentes.length
          || space.materias.some((materia) => !input.componentes.some((item) => item.materiaId === materia.id))) {
          throw new AppError(409, 'La selección debe incluir exactamente todas las materias actuales del espacio');
        }

        const planned = [] as Array<{ materiaId: number; periodo: any; docenteId?: number | null; existing?: any }>;
        for (const item of input.componentes) {
          const materia = space.materias.find((row) => row.id === item.materiaId)!;
          if (!materia.activo || materia.carreraId !== space.carreraId) throw new AppError(409, `La materia ${materia.nombre} debe estar activa y pertenecer a la carrera del espacio`);
          if (item.docenteId != null) {
            const docente = await tx.usuario.findUnique({ where: { idUsuario: item.docenteId }, select: { idUsuario: true, rol: true } });
            const roles = (docente?.rol ?? '').split(',').map((rol: string) => rol.trim());
            if (!docente || !roles.includes(ROLES.PROFESOR)) throw new AppError(400, `El docente asignado a ${materia.nombre} debe tener rol PROFESOR`);
          }
          const periodo = item.periodo ?? materia.periodo ?? input.periodo ?? 'ANUAL';
          const existing = await tx.cursada.findUnique({ where: { materiaId_anioLectivo_periodo: {
            materiaId: materia.id, anioLectivo: input.anioLectivo, periodo
          } } });
          if (existing?.cursadaEspacioId != null) throw new AppError(409, `La cursada existente de ${materia.nombre} ya pertenece a otra oferta de espacio`);
          if (existing && !existing.activo) throw new AppError(409, `La cursada existente de ${materia.nombre} está inactiva; activala antes de incluirla en el espacio`);
          if (existing && item.docenteId !== undefined && existing.docenteId !== item.docenteId) {
            throw new AppError(409, `La cursada existente de ${materia.nombre} ya tiene otro docente; no se modificaron sus datos`);
          }
          planned.push({ materiaId: materia.id, periodo, ...(item.docenteId !== undefined ? { docenteId: item.docenteId } : {}), ...(existing ? { existing } : {}) });
        }

        const offer = await tx.cursadaEspacio.create({ data: {
          espacioCurricularId: space.id,
          anioLectivo: input.anioLectivo,
          periodo: (input.periodo ?? 'ANUAL') as any
        } });
        for (const item of planned) {
          if (item.existing) {
            await tx.cursada.update({ where: { id: item.existing.id }, data: { cursadaEspacioId: offer.id } });
          } else {
            await tx.cursada.create({ data: {
              materiaId: item.materiaId,
              anioLectivo: input.anioLectivo,
              periodo: item.periodo,
              docenteId: item.docenteId ?? null,
              cursadaEspacioId: offer.id,
              activo: true
            } });
          }
        }
        return offer.id;
      });
      return await this.get(id, currentUser);
    } catch (error) {
      mapConflict(error);
    }
  }

  async list(filters: { page?: number; limit?: number; carreraId?: number; anioLectivo?: number; activo?: boolean; search?: string }, currentUser: any) {
    this.requireAdmin(currentUser);
    const { page, limit, skip } = normalizePagination(filters);
    const where: any = {
      ...(filters.carreraId ? { espacioCurricular: { carreraId: filters.carreraId } } : {}),
      ...(filters.anioLectivo ? { anioLectivo: filters.anioLectivo } : {}),
      ...(filters.activo !== undefined ? { activo: filters.activo } : {}),
      ...(filters.search ? { espacioCurricular: { ...(filters.carreraId ? { carreraId: filters.carreraId } : {}), nombre: { contains: filters.search } } } : {})
    };
    const [data, total] = await Promise.all([
      prisma.cursadaEspacio.findMany({ where, skip, take: limit, include: ofertaInclude, orderBy: [{ anioLectivo: 'desc' }, { espacioCurricular: { nombre: 'asc' } }, { id: 'asc' }] }),
      prisma.cursadaEspacio.count({ where })
    ]);
    return { ...paginated(data.map(presentar), total, page, limit) };
  }

  async get(id: number, currentUser: any) {
    this.requireAdmin(currentUser);
    const oferta = await prisma.cursadaEspacio.findUnique({ where: { id }, include: ofertaInclude });
    if (!oferta) throw new AppError(404, 'Cursada de espacio no encontrada');
    return presentar(oferta);
  }

  async update(id: number, input: UpdateInput, currentUser: any) {
    this.requireAdmin(currentUser);
    try {
      await prisma.$transaction(async (tx) => {
        const initial = await tx.cursadaEspacio.findUnique({ where: { id }, select: { id: true, espacioCurricular: { select: { carreraId: true } } } });
        if (!initial) throw new AppError(404, 'Cursada de espacio no encontrada');
        await tx.$queryRaw`SELECT id FROM carreras WHERE id = ${initial.espacioCurricular.carreraId} FOR UPDATE`;
        const oferta = await tx.cursadaEspacio.findUnique({ where: { id }, include: { espacioCurricular: { select: { carreraId: true, materias: { select: { id: true } } } }, componentes: { select: { id: true, materiaId: true, docenteId: true, activo: true, periodo: true, _count: { select: { inscripciones: true, asistencias: true, calificaciones: true, horarios: true } } } }, _count: { select: { inscripciones: true } } } });
        if (!oferta) throw new AppError(404, 'Cursada de espacio no encontrada');
        if (input.activo === true) {
          const currentIds = oferta.componentes.map((cursada: any) => cursada.materiaId).sort((a: number, b: number) => a - b);
          const catalogIds = oferta.espacioCurricular.materias.map((materia: any) => materia.id).sort((a: number, b: number) => a - b);
          if (currentIds.length < 2 || currentIds.length !== catalogIds.length || currentIds.some((id: number, index: number) => id !== catalogIds[index]) || oferta.componentes.some((item: any) => !item.activo)) {
            throw new AppError(409, 'La oferta quedó desactualizada respecto de la composición del espacio y no puede reactivarse');
          }
        }
        if (input.activo === false && (oferta._count.inscripciones > 0 || oferta.componentes.some((item: any) => item._count.inscripciones > 0 || item._count.asistencias > 0 || item._count.calificaciones > 0 || item._count.horarios > 0))) {
          throw new AppError(409, 'No se puede desactivar una oferta que ya tiene matrículas o datos académicos');
        }
        if (input.componentes) {
          const byMatter = new Map(input.componentes.map((entry) => [entry.materiaId, entry]));
          if (byMatter.size !== oferta.componentes.length || oferta.componentes.some((item: any) => !byMatter.has(item.materiaId))) {
            throw new AppError(400, 'Los componentes deben coincidir con todas las materias de la oferta');
          }
          for (const [materiaId, requested] of byMatter) {
            const child = oferta.componentes.find((item: any) => item.materiaId === materiaId);
            if (!child) throw new AppError(409, 'La oferta cambió mientras se actualizaban sus componentes');
            if (requested.periodo !== undefined && requested.periodo !== child.periodo) {
              throw new AppError(409, `No se puede cambiar el período de la cursada usada de materia ${materiaId}`);
            }
            if (requested.docenteId === undefined) continue;
            const docenteId = requested.docenteId;
            if (docenteId !== null) {
              const docente = await tx.usuario.findUnique({ where: { idUsuario: docenteId }, select: { rol: true } });
              if (!(docente?.rol ?? '').split(',').map((rol: string) => rol.trim()).includes(ROLES.PROFESOR)) {
                throw new AppError(400, `El usuario ${docenteId} no tiene rol PROFESOR`);
              }
            }
            await tx.cursada.update({ where: { id: child.id }, data: { docenteId } });
          }
        }
        if (input.activo !== undefined) await tx.cursadaEspacio.update({ where: { id }, data: { activo: input.activo } });
      });
      return await this.get(id, currentUser);
    } catch (error) {
      mapConflict(error);
    }
  }

  async deactivate(id: number, currentUser: any) {
    return this.update(id, { activo: false }, currentUser);
  }
}

export default new CursadaEspacioService();
