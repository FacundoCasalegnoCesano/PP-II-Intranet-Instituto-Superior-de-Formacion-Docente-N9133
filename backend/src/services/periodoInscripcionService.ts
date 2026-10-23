import periodoInscripcionRepository from '../repositories/periodoInscripcionRepository.js';
import { cursadaEspacioResumenSelect } from '../repositories/periodoInscripcionRepository.js';
import materiaRepository from '../repositories/materiaRepository.js';
import { ROLES } from '../constants/roles.js';
import { prisma } from '../config/prisma.js';
import type {
  PeriodoInscripcionCreateData,
  PeriodoInscripcionListadoRecord,
  PeriodoInscripcionUpdateData
} from '../repositories/periodoInscripcionRepository.js';

export type PeriodoEstado = 'DESACTIVADO' | 'PROGRAMADO' | 'ABIERTO' | 'FINALIZADO';

type PeriodoValidationClient = Pick<typeof prisma, 'materia' | 'cursadaEspacio' | 'mesa'>;

export interface PeriodoInscripcionListadoDTO {
  id: number;
  tipo: string;
  cicloLectivo: number;
  fechaInicio: Date;
  fechaFin: Date;
  descripcion: string | null;
  activo: boolean;
  cantidadMaterias: number;
  cantidadEspacios: number;
  cursadasEspacios: PeriodoInscripcionListadoRecord['cursadasEspacios'];
  cantidadMesas: number;
  estado: PeriodoEstado;
}

export function calcularEstadoPeriodo(
  periodo: Pick<PeriodoInscripcionListadoRecord, 'activo' | 'fechaInicio' | 'fechaFin'>,
  ahora: Date = new Date()
): PeriodoEstado {
  if (!periodo.activo) return 'DESACTIVADO';
  if (ahora < periodo.fechaInicio) return 'PROGRAMADO';
  if (ahora <= periodo.fechaFin) return 'ABIERTO';
  return 'FINALIZADO';
}

function toPeriodoInscripcionListadoDTO(
  periodo: PeriodoInscripcionListadoRecord,
  ahora: Date
): PeriodoInscripcionListadoDTO {
  return {
    id: periodo.id,
    tipo: periodo.tipo,
    cicloLectivo: periodo.cicloLectivo,
    fechaInicio: periodo.fechaInicio,
    fechaFin: periodo.fechaFin,
    descripcion: periodo.descripcion,
    activo: periodo.activo,
    cantidadMaterias: periodo._count.materias,
    cantidadEspacios: periodo._count.cursadasEspacios,
    cursadasEspacios: periodo.cursadasEspacios,
    cantidadMesas: periodo._count.mesas,
    estado: calcularEstadoPeriodo(periodo, ahora)
  };
}

class PeriodoInscripcionService {
  async crearPeriodo(data: PeriodoInscripcionCreateData, currentUser: any) {
    if (currentUser.rol !== ROLES.ADMINISTRATIVO) {
      throw new Error('Solo administrativos pueden crear períodos de inscripción');
    }

    const fechaInicio = new Date(data.fechaInicio);
    const fechaFin = new Date(data.fechaFin);

    if (fechaInicio >= fechaFin) {
      throw new Error('La fecha de inicio debe ser menor que la fecha de fin');
    }

    await this.validarSeleccion(data);

    return await periodoInscripcionRepository.create(data);
  }

  /**
   * El período debe habilitar explícitamente su contenido:
   * - MATERIA: al menos una materia existente (selección por carrera/año)
   * - EXAMEN: al menos una mesa existente
   */
  private async validarSeleccion(data: { tipo?: string; cicloLectivo?: number; materiasIds?: number[]; cursadasEspaciosIds?: number[]; mesasIds?: number[] }, db: PeriodoValidationClient = prisma) {
    if (data.tipo === 'MATERIA') {
      const materiaIds = data.materiasIds ?? [];
      const ofertaIds = data.cursadasEspaciosIds ?? [];
      if (materiaIds.length === 0 && ofertaIds.length === 0) {
        throw new Error('El período debe incluir al menos una materia o cursada de espacio');
      }
      if (materiaIds.length > 0) {
        const existentes = await db.materia.findMany({ where: { id: { in: materiaIds } }, select: { id: true } });
        const encontrados = new Set(existentes.map(materia => materia.id));
        const invalida = materiaIds.find(id => !encontrados.has(id));
        if (invalida !== undefined) throw new Error(`La materia ${invalida} no existe`);
      }
      if (ofertaIds.length > 0) {
        const ofertas = await db.cursadaEspacio.findMany({
          where: { id: { in: ofertaIds }, activo: true, ...(data.cicloLectivo !== undefined ? { anioLectivo: data.cicloLectivo } : {}) },
          include: { espacioCurricular: { include: { materias: { select: { id: true } } } }, componentes: { select: { materiaId: true } } }
        });
        const encontrados = new Set(ofertas.map(oferta => oferta.id));
        const invalida = ofertaIds.find(id => !encontrados.has(id));
        if (invalida !== undefined) throw new Error(`La cursada de espacio ${invalida} no existe, está inactiva o no corresponde al ciclo lectivo`);
        for (const oferta of ofertas) {
          const componentes = oferta.componentes.map(item => item.materiaId).sort((a, b) => a - b);
          const catalogo = oferta.espacioCurricular.materias.map(item => item.id).sort((a, b) => a - b);
          if (componentes.length < 2 || componentes.length !== catalogo.length || componentes.some((id, index) => id !== catalogo[index])) {
            throw new Error(`La cursada de espacio ${oferta.id} no refleja la composición completa del espacio`);
          }
        }
      }
    } else if (data.tipo === 'EXAMEN') {
      const ids = data.mesasIds ?? [];
      if (ids.length === 0) {
        throw new Error('El período debe incluir al menos una mesa de examen');
      }
      const existentes = await db.mesa.findMany({
        where: { id: { in: ids }, activo: true },
        select: { id: true }
      });
      const encontrados = new Set(existentes.map(mesa => mesa.id));
      const invalida = ids.find(id => !encontrados.has(id));
      if (invalida !== undefined) throw new Error(`La mesa de examen ${invalida} no existe o está inactiva`);
    }
  }

  /**
   * ¿Existe un período MATERIA vigente que incluya explícitamente esta materia?
   */
  async materiaHabilitada(materiaId: number): Promise<boolean> {
    return await periodoInscripcionRepository.materiaHabilitadaEnPeriodoVigente(materiaId);
  }

  /**
   * ¿Existe un período EXAMEN vigente que incluya explícitamente esta mesa?
   */
  async mesaHabilitada(mesaId: number): Promise<boolean> {
    return await periodoInscripcionRepository.mesaHabilitadaEnPeriodoVigente(mesaId);
  }

  async getPeriodoById(id: number) {
    const periodo = await periodoInscripcionRepository.findById(id);
    if (!periodo) {
      throw new Error('Período no encontrado');
    }
    return periodo;
  }

  async listPeriodos(
    filters: { tipo?: string; activo?: boolean; cicloLectivo?: number; page?: number; limit?: number } = {},
    ahora: Date = new Date()
  ) {
    const resultado = await periodoInscripcionRepository.findAll(filters);
    return {
      ...resultado,
      data: resultado.data.map(periodo => toPeriodoInscripcionListadoDTO(periodo, ahora))
    };
  }

  async listPeriodosActivos(tipo: string): Promise<any[]> {
    return await periodoInscripcionRepository.findActivosByTipo(tipo);
  }

  async updatePeriodo(id: number, data: PeriodoInscripcionUpdateData, currentUser: any) {
    if (currentUser.rol !== ROLES.ADMINISTRATIVO) {
      throw new Error('Solo administrativos pueden actualizar períodos de inscripción');
    }

    const periodo = await periodoInscripcionRepository.findById(id);
    if (!periodo) {
      throw new Error('Período no encontrado');
    }

    // Validar fechas
    const fechaInicio = data.fechaInicio ? new Date(data.fechaInicio) : periodo.fechaInicio;
    const fechaFin = data.fechaFin ? new Date(data.fechaFin) : periodo.fechaFin;

    if (fechaInicio >= fechaFin) {
      throw new Error('La fecha de inicio debe ser menor que la fecha de fin');
    }

    const { materiasIds, cursadasEspaciosIds, mesasIds, ...resto } = data;
    return await prisma.$transaction(async tx => {
      // Space enrollment takes the same period row lock before it validates
      // availability, so selection changes cannot race an active registration.
      await tx.$queryRaw`SELECT id FROM periodos_inscripcion WHERE id = ${id} FOR UPDATE`;
      const periodoActual = await tx.periodoInscripcion.findUnique({
        where: { id },
        include: { materias: true, cursadasEspacios: true, mesas: true }
      });
      if (!periodoActual) throw new Error('Período no encontrado');
      const fechaInicioActual = data.fechaInicio ? new Date(data.fechaInicio) : periodoActual.fechaInicio;
      const fechaFinActual = data.fechaFin ? new Date(data.fechaFin) : periodoActual.fechaFin;
      if (fechaInicioActual >= fechaFinActual) {
        throw new Error('La fecha de inicio debe ser menor que la fecha de fin');
      }
      const cambiaSeleccion = data.tipo !== undefined
        || resto.cicloLectivo !== undefined
        || materiasIds !== undefined
        || cursadasEspaciosIds !== undefined
        || mesasIds !== undefined;
      if (cambiaSeleccion) {
        const tipoDestino = data.tipo ?? periodoActual.tipo;
        if (tipoDestino === 'EXAMEN' && (materiasIds?.length || cursadasEspaciosIds?.length)) {
          throw new Error('Un período EXAMEN no admite materias ni cursadas de espacios');
        }
        if (tipoDestino === 'MATERIA' && mesasIds?.length) {
          throw new Error('Un período MATERIA no admite mesas de examen');
        }
        await this.validarSeleccion({
          tipo: tipoDestino,
          cicloLectivo: data.cicloLectivo ?? periodoActual.cicloLectivo,
          ...(tipoDestino === 'MATERIA' ? {
            materiasIds: materiasIds ?? periodoActual.materias.map((item: any) => item.materiaId),
            cursadasEspaciosIds: cursadasEspaciosIds ?? periodoActual.cursadasEspacios.map((item: any) => item.cursadaEspacioId)
          } : { mesasIds: mesasIds ?? periodoActual.mesas.map((item: any) => item.mesaId) })
        }, tx);
      }
      if (resto.tipo !== undefined && resto.tipo !== periodoActual.tipo) {
        if (resto.tipo === 'MATERIA') await tx.periodoMesaHabilitada.deleteMany({ where: { periodoInscripcionId: id } });
        else {
          await tx.periodoMateriaHabilitada.deleteMany({ where: { periodoInscripcionId: id } });
          await tx.periodoEspacioHabilitado.deleteMany({ where: { periodoInscripcionId: id } });
        }
      }
      if (materiasIds !== undefined) {
        await tx.periodoMateriaHabilitada.deleteMany({ where: { periodoInscripcionId: id } });
        if (materiasIds.length) await tx.periodoMateriaHabilitada.createMany({
          data: materiasIds.map(materiaId => ({ periodoInscripcionId: id, materiaId }))
        });
      }
      if (cursadasEspaciosIds !== undefined) {
        await tx.periodoEspacioHabilitado.deleteMany({ where: { periodoInscripcionId: id } });
        if (cursadasEspaciosIds.length) await tx.periodoEspacioHabilitado.createMany({
          data: cursadasEspaciosIds.map(cursadaEspacioId => ({ periodoInscripcionId: id, cursadaEspacioId }))
        });
      }
      if (mesasIds !== undefined) {
        await tx.periodoMesaHabilitada.deleteMany({ where: { periodoInscripcionId: id } });
        if (mesasIds.length) await tx.periodoMesaHabilitada.createMany({
          data: mesasIds.map(mesaId => ({ periodoInscripcionId: id, mesaId }))
        });
      }
      return tx.periodoInscripcion.update({
        where: { id },
        data: {
          ...resto,
          ...(resto.tipo ? { tipo: resto.tipo as any } : {}),
          ...(resto.fechaInicio ? { fechaInicio: new Date(resto.fechaInicio) } : {}),
          ...(resto.fechaFin ? { fechaFin: new Date(resto.fechaFin) } : {})
        },
        include: { materias: true, cursadasEspacios: { include: { cursadaEspacio: { select: cursadaEspacioResumenSelect } } }, mesas: true }
      });
    });
  }

  async deletePeriodo(id: number, currentUser: any) {
    if (currentUser.rol !== ROLES.ADMINISTRATIVO) {
      throw new Error('Solo administrativos pueden eliminar períodos de inscripción');
    }

    const periodo = await periodoInscripcionRepository.findById(id);
    if (!periodo) {
      throw new Error('Período no encontrado');
    }

    return await periodoInscripcionRepository.delete(id);
  }

  async verificarInscripcionHabilitada(tipo: string): Promise<boolean> {
    return await periodoInscripcionRepository.isInscripcionHabilitada(tipo);
  }
}

export default new PeriodoInscripcionService();
