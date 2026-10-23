import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { ROLES } from '../constants/roles.js';
import { AppError } from '../utils/AppError.js';
import { latchSpaceIfStudentCompleted, lockCareerForAcademicMutation } from './espacioComposicionLatch.js';
import inscripcionHistoricaService from './inscripcionHistoricaService.js';
import { anioInstitucionalActual } from '../utils/cicloLectivo.js';

export interface HistoricalExamFilters {
  alumnoId?: number;
  carreraId?: number;
  materiaId?: number;
  cicloLectivo?: number;
  cursadaId?: number;
}

export interface HistoricalExamCreateData {
  alumnoId: number;
  cursadaId: number;
  materiaId?: number;
  cicloLectivo?: number;
  fechaExamen: string;
  notaFinal: number;
  libro?: string | null;
  folio?: string | null;
}

export interface HistoricalExamUpdateData {
  notaFinal: number;
  libro: string | null;
  folio: string | null;
  motivo: string;
  expectedVersion: number;
}

interface HistoricalExamActor { id: number; rol: string }

function requireAdmin(actor: HistoricalExamActor | undefined): asserts actor is HistoricalExamActor {
  if (!actor || actor.rol !== ROLES.ADMINISTRATIVO) {
    throw new AppError(403, 'Solo administrativos pueden gestionar mesas históricas');
  }
}

function toCivilDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AppError(400, 'La fecha debe tener formato YYYY-MM-DD');
  const [year = 0, month = 0, day = 0] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new AppError(400, 'La fecha debe ser un día calendario válido');
  }
  return date;
}

function dateLabel(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function mapRecord(row: any) {
  return {
    id: row.id,
    alumnoId: row.alumno.idCuenta,
    nombreAlumno: row.alumno.usuario.apellidoNombre,
    carreraId: row.mesa.materia.carrera.id,
    nombreCarrera: row.mesa.materia.carrera.nombre,
    materiaId: row.mesa.materia.id,
    nombreMateria: row.mesa.materia.nombre,
    cicloLectivo: row.historicoCicloLectivo,
    cursadaId: row.inscripcionMateria?.cursadaId ?? null,
    inscripcionMateriaId: row.inscripcionMateriaId ?? null,
    fechaExamen: dateLabel(row.historicoFechaCivil),
    notaFinal: row.notaFinal,
    libro: row.mesa.libroExamen,
    folio: row.mesa.folioExamen,
    version: row.mesa.version
  };
}

function isPrismaError(error: unknown, code: string): boolean {
  return !!error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === code;
}

function isHistoricalDuplicate(error: unknown): boolean {
  if (!isPrismaError(error, 'P2002')) return false;
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  if (target === undefined) return true;
  return String(Array.isArray(target) ? target.join(',') : target).toLowerCase().includes('historico')
    || String(Array.isArray(target) ? target.join(',') : target).toLowerCase().includes('historical')
    || String(Array.isArray(target) ? target.join(',') : target).toLowerCase().includes('inscripcion_examen_historico_dedupe')
    || String(Array.isArray(target) ? target.join(',') : target).includes('historicoMateriaId');
}

const recordInclude = {
  alumno: { select: { idCuenta: true, usuario: { select: { apellidoNombre: true } } } },
  inscripcionMateria: { select: { id: true, cursadaId: true } },
  mesa: { select: { version: true, libroExamen: true, folioExamen: true, materia: { select: { id: true, nombre: true, carrera: { select: { id: true, nombre: true } } } } } }
};

class ExamenHistoricoService {
  async list(filters: HistoricalExamFilters, actor: HistoricalExamActor) {
    requireAdmin(actor);
    const rows = await prisma.inscripcionExamen.findMany({
      where: {
        historicoMateriaId: filters.materiaId === undefined ? { not: null } : filters.materiaId,
        historicoCicloLectivo: filters.cicloLectivo === undefined ? { not: null } : filters.cicloLectivo,
        historicoFechaCivil: { not: null },
        ...(filters.cursadaId === undefined ? {} : { inscripcionMateria: { cursadaId: filters.cursadaId } }),
        ...(filters.alumnoId === undefined ? {} : { alumno: { idCuenta: filters.alumnoId } }),
        mesa: {
          origen: 'HISTORICA',
          ...(filters.carreraId === undefined ? {} : { materia: { carreraId: filters.carreraId } })
        }
      },
      include: recordInclude,
      orderBy: [{ historicoFechaCivil: 'desc' }, { id: 'desc' }]
    });
    return rows.map(mapRecord);
  }

  async create(data: HistoricalExamCreateData, actor: HistoricalExamActor) {
    requireAdmin(actor);
    const fechaCivil = toCivilDate(data.fechaExamen);

    try {
      return await prisma.$transaction(async (tx) => {
        const course = await (tx as any).cursada.findUnique({ where: { id: data.cursadaId }, include: { materia: { select: { id: true, carreraId: true } } } });
        if (!course) throw new AppError(404, 'La cursada histórica no existe');
        if (course.anioLectivo >= anioInstitucionalActual()) throw new AppError(409, 'El examen histórico requiere una cursada de un ciclo anterior');
        if ((data.materiaId !== undefined && data.materiaId !== course.materiaId)
          || (data.cicloLectivo !== undefined && data.cicloLectivo !== course.anioLectivo)) {
          throw new AppError(409, 'La materia y el ciclo deben coincidir con la cursada seleccionada');
        }
        await lockCareerForAcademicMutation(tx, course.materia.carreraId);
        const linked = await inscripcionHistoricaService.crear(data.cursadaId, data.alumnoId, actor, tx);
        const alumno = await tx.alumno.findUnique({ where: { idCuenta: data.alumnoId }, include: { usuario: true } });
        if (!alumno) throw new AppError(404, 'Alumno no encontrado');
        const lockedMateria = await tx.materia.findUnique({ where: { id: course.materiaId }, include: { carrera: true } });
        if (!lockedMateria) throw new AppError(404, 'Materia no encontrada');
        const publishedAt = new Date();
        const mesa = await tx.mesa.create({
          data: {
            materiaId: lockedMateria.id,
            fecha: null,
            fechaCivil,
            tipoExamen: null,
            llamado: null,
            origen: 'HISTORICA',
            cicloLectivo: course.anioLectivo,
            estadoMesa: 'FINALIZADA',
            version: 0,
            publicadaEn: publishedAt,
            activo: true,
            libroExamen: data.libro ?? null,
            folioExamen: data.folio ?? null
          }
        });
        const enrollment = await tx.inscripcionExamen.create({
          data: {
            mesaId: mesa.id,
            alumnoId: alumno.idAlumno,
            inscripcionMateriaId: linked.idInscripcionMateria,
            fechaBaja: null,
            notaFinal: data.notaFinal,
            condicion: null,
            version: 0,
            historicoMateriaId: lockedMateria.id,
            historicoCicloLectivo: course.anioLectivo,
            historicoFechaCivil: fechaCivil,
            aprobado: data.notaFinal >= (lockedMateria.notaMinima ?? 6),
            notaBorrador: null,
            ausenteBorrador: false,
            ausentePublicado: false
          }
        });
        await tx.mesaResultadoAuditoria.create({
          data: {
            mesaId: mesa.id,
            inscripcionId: enrollment.id,
            actorId: actor.id,
            accion: 'CIERRE',
            motivo: 'Registro inicial de resultado histórico',
            notaAnterior: null,
            notaNueva: data.notaFinal,
            ausenteAnterior: false,
            ausenteNuevo: false
          }
        });
        await latchSpaceIfStudentCompleted({
          tx,
          carreraId: lockedMateria.carreraId,
          espacioCurricularId: lockedMateria.espacioCurricularId ?? null,
          materiaId: lockedMateria.id,
          alumnoId: alumno.idAlumno,
          newlyApproved: enrollment.aprobado === true
        });
        return mapRecord({
          ...enrollment,
          inscripcionMateria: { id: linked.idInscripcionMateria, cursadaId: data.cursadaId },
          inscripcionMateriaId: linked.idInscripcionMateria,
          alumno: { idCuenta: data.alumnoId, usuario: { apellidoNombre: alumno.usuario.apellidoNombre } },
          mesa: { ...mesa, materia: { ...lockedMateria, carrera: lockedMateria.carrera } },
          historicoCicloLectivo: course.anioLectivo,
          historicoFechaCivil: fechaCivil
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (isHistoricalDuplicate(error)) throw new AppError(409, 'Ya existe un resultado para ese alumno, materia, ciclo y fecha');
      if (isPrismaError(error, 'P2034')) throw new AppError(409, 'El registro histórico cambió durante la operación; reintentá');
      throw error;
    }
  }

  async update(id: number, data: HistoricalExamUpdateData, actor: HistoricalExamActor) {
    requireAdmin(actor);
    try {
      return await prisma.$transaction(async (tx) => {
        let row = await tx.inscripcionExamen.findUnique({ where: { id }, include: { ...recordInclude, mesa: { include: { materia: { include: { carrera: true } } } } } });
        if (!row || row.mesa.origen !== 'HISTORICA' || row.historicoMateriaId === null || row.historicoFechaCivil === null) {
          throw new AppError(404, 'Resultado histórico no encontrado');
        }
        await lockCareerForAcademicMutation(tx, row.mesa.materia.carreraId);
        row = await tx.inscripcionExamen.findUnique({ where: { id }, include: { ...recordInclude, mesa: { include: { materia: { include: { carrera: true } } } } } });
        if (!row || row.mesa.origen !== 'HISTORICA' || row.historicoMateriaId === null || row.historicoFechaCivil === null) {
          throw new AppError(404, 'Resultado histórico no encontrado');
        }
        if (row.mesa.version !== data.expectedVersion) throw new AppError(409, `El resultado cambió; versión actual ${row.mesa.version}`);

        const updatedMesa = await tx.mesa.updateMany({
          where: { id: row.mesaId, origen: 'HISTORICA', version: data.expectedVersion },
          data: {
            version: { increment: 1 },
            libroExamen: data.libro,
            folioExamen: data.folio
          }
        });
        if (updatedMesa.count !== 1) throw new AppError(409, 'El resultado histórico cambió; volvé a cargarlo');

        const enrollment = await tx.inscripcionExamen.update({
          where: { id },
          data: {
            notaFinal: data.notaFinal,
            aprobado: data.notaFinal >= (row.mesa.materia.notaMinima ?? 6),
            ausentePublicado: false,
            version: { increment: 1 }
          }
        });
        await tx.mesaResultadoAuditoria.create({
          data: {
            mesaId: row.mesaId,
            inscripcionId: id,
            actorId: actor.id,
            accion: 'CORRECCION',
            motivo: data.motivo,
            notaAnterior: row.notaFinal,
            notaNueva: data.notaFinal,
            ausenteAnterior: row.ausentePublicado,
            ausenteNuevo: false
          }
        });
        await latchSpaceIfStudentCompleted({
          tx,
          carreraId: row.mesa.materia.carreraId,
          espacioCurricularId: row.mesa.materia.espacioCurricularId ?? null,
          materiaId: row.mesa.materia.id,
          alumnoId: row.alumnoId,
          newlyApproved: enrollment.aprobado === true
        });
        return mapRecord({
          ...enrollment,
          alumno: row.alumno,
          mesa: {
            ...row.mesa,
            version: data.expectedVersion + 1,
            libroExamen: data.libro,
            folioExamen: data.folio,
            materia: row.mesa.materia
          }
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (isPrismaError(error, 'P2034')) throw new AppError(409, 'El resultado histórico cambió durante la operación; reintentá');
      throw error;
    }
  }
}

export default new ExamenHistoricoService();
