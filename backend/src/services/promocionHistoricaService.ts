import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { ROLES } from '../constants/roles.js';
import { AppError } from '../utils/AppError.js';
import { latchSpaceIfStudentCompleted, lockCareerForAcademicMutation } from './espacioComposicionLatch.js';
import inscripcionHistoricaService from './inscripcionHistoricaService.js';
import { anioInstitucionalActual } from '../utils/cicloLectivo.js';

interface Actor { id: number; rol: string }
interface Filters { alumnoId?: number; carreraId?: number; materiaId?: number; cicloLectivo?: number; cursadaId?: number }
interface CreateData { alumnoId: number; cursadaId: number; notaFinal: number; fechaAcreditacion: string; motivo?: string }
interface UpdateData { notaFinal: number; fechaAcreditacion?: string; motivo: string; expectedVersion: number }

function requireAdmin(actor?: Actor): asserts actor is Actor {
  if (!actor || actor.rol !== ROLES.ADMINISTRATIVO) throw new AppError(403, 'Solo administrativos pueden gestionar promociones históricas');
}

function civilDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AppError(400, 'La fecha debe tener formato YYYY-MM-DD');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month! - 1 || date.getUTCDate() !== day) {
    throw new AppError(400, 'La fecha debe ser un día calendario válido');
  }
  return date;
}

const include = {
  inscripcionMateria: {
    include: {
      alumno: { select: { idCuenta: true, usuario: { select: { apellidoNombre: true } } } },
      materia: { select: { id: true, nombre: true, carreraId: true, espacioCurricularId: true, carrera: { select: { id: true, nombre: true } }, notaMinima: true } },
      cursada: { select: { id: true, anioLectivo: true, periodo: true, cursadaEspacioId: true } }
    }
  },
  auditorias: { include: { actor: { select: { idUsuario: true, apellidoNombre: true } } }, orderBy: { version: 'asc' as const } }
} satisfies Prisma.PromocionHistoricaInclude;

type PromotionWithRelations = Prisma.PromocionHistoricaGetPayload<{ include: typeof include }>;

function present(row: PromotionWithRelations) {
  const registration = row.inscripcionMateria;
  const course = registration.cursada;
  if (!course) throw new AppError(409, 'La promoción histórica no está vinculada a una cursada');
  return {
    id: row.id,
    alumnoId: registration.alumno.idCuenta,
    alumno: { idUsuario: registration.alumno.idCuenta, apellidoNombre: registration.alumno.usuario.apellidoNombre },
    inscripcionMateriaId: registration.id,
    cursadaId: registration.cursadaId,
    materia: { id: registration.materia.id, nombre: registration.materia.nombre },
    carrera: { id: registration.materia.carrera.id, nombre: registration.materia.carrera.nombre },
    cicloLectivo: course.anioLectivo,
    notaFinal: row.notaFinal,
    fechaAcreditacion: row.fechaAcreditacion.toISOString().slice(0, 10),
    via: 'PROMOCION_DIRECTA' as const,
    version: row.version,
    estado: row.version > 1 ? 'CORREGIDA' as const : 'VIGENTE' as const,
    auditoria: row.auditorias.map(audit => ({
      version: audit.version, notaAnterior: audit.notaAnterior, notaNueva: audit.notaNueva,
      fechaAnterior: audit.fechaAnterior?.toISOString().slice(0, 10) ?? null,
      fechaNueva: audit.fechaNueva.toISOString().slice(0, 10), motivo: audit.motivo,
      actor: { idUsuario: audit.actor.idUsuario, apellidoNombre: audit.actor.apellidoNombre }, createdAt: audit.createdAt
    }))
  };
}

function translateConflict(error: unknown): never {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: string }).code;
    if (code === 'P2002') throw new AppError(409, 'Ya existe una promoción histórica para esta matrícula; corregí el registro existente');
    if (code === 'P2034') throw new AppError(409, 'La promoción histórica cambió durante la operación; volvé a cargarla');
  }
  throw error;
}

class PromocionHistoricaService {
  async list(filters: Filters, actor: Actor) {
    requireAdmin(actor);
    const inscripcionWhere: Prisma.InscripcionMateriaWhereInput = {
      ...(filters.carreraId === undefined ? {} : { materia: { carreraId: filters.carreraId } }),
      ...(filters.materiaId === undefined ? {} : { materiaId: filters.materiaId }),
      ...(filters.cicloLectivo === undefined ? {} : { cicloLectivo: filters.cicloLectivo }),
      ...(filters.cursadaId === undefined ? {} : { cursadaId: filters.cursadaId })
    };
    const where: Prisma.PromocionHistoricaWhereInput = {
      ...(filters.alumnoId === undefined ? {} : { alumno: { idCuenta: filters.alumnoId } }),
      ...(Object.keys(inscripcionWhere).length === 0 ? {} : { inscripcionMateria: inscripcionWhere })
    };
    const rows = await prisma.promocionHistorica.findMany({
      where, include, orderBy: [{ fechaAcreditacion: 'desc' }, { id: 'desc' }]
    });
    return { items: rows.map(present) };
  }

  async create(data: CreateData, actor: Actor) {
    requireAdmin(actor);
    const fecha = civilDate(data.fechaAcreditacion);
    try {
      return await prisma.$transaction(async (transaction) => {
        const course = await transaction.cursada.findUnique({ where: { id: data.cursadaId }, include: { materia: { select: { carreraId: true, notaMinima: true, espacioCurricularId: true } } } });
        if (!course) throw new AppError(404, 'La cursada histórica no existe');
        if (course.anioLectivo >= anioInstitucionalActual()) throw new AppError(409, 'La promoción histórica requiere una cursada de un ciclo anterior');
        if (data.notaFinal < (course.materia.notaMinima ?? 6)) throw new AppError(400, `La nota debe alcanzar el mínimo aprobatorio de ${course.materia.notaMinima ?? 6}`);
        await lockCareerForAcademicMutation(transaction, course.materia.carreraId);
        const linked = await inscripcionHistoricaService.crear(data.cursadaId, data.alumnoId, actor, transaction);
        const registration = await transaction.inscripcionMateria.findUnique({ where: { id: linked.idInscripcionMateria } });
        if (!registration) throw new AppError(409, 'No se pudo recuperar la inscripción histórica creada');
        const promotion = await transaction.promocionHistorica.create({ data: {
          inscripcionMateriaId: registration.id, alumnoId: registration.alumnoId,
          notaFinal: data.notaFinal, fechaAcreditacion: fecha, version: 1, createdById: actor.id,
          auditorias: { create: {
            version: 1, notaAnterior: null, notaNueva: data.notaFinal, fechaAnterior: null,
            fechaNueva: fecha, motivo: data.motivo?.trim() || 'Alta administrativa de promoción histórica', actorId: actor.id
          } }
        }, include });
        await latchSpaceIfStudentCompleted({
          tx: transaction, carreraId: course.materia.carreraId, espacioCurricularId: course.materia.espacioCurricularId,
          materiaId: registration.materiaId, alumnoId: registration.alumnoId, newlyApproved: true
        });
        return present(promotion);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { return translateConflict(error); }
  }

  async update(id: number, data: UpdateData, actor: Actor) {
    requireAdmin(actor);
    const fecha = data.fechaAcreditacion ? civilDate(data.fechaAcreditacion) : undefined;
    try {
      return await prisma.$transaction(async (transaction) => {
        let row = await transaction.promocionHistorica.findUnique({ where: { id }, include });
        if (!row) throw new AppError(404, 'Promoción histórica no encontrada');
        const registration = row.inscripcionMateria;
        await lockCareerForAcademicMutation(transaction, registration.materia.carreraId);
        row = await transaction.promocionHistorica.findUnique({ where: { id }, include });
        if (!row) throw new AppError(404, 'Promoción histórica no encontrada');
        if (row.version !== data.expectedVersion) throw new AppError(409, `La promoción cambió; versión actual ${row.version}`);
        const minimum = row.inscripcionMateria.materia.notaMinima ?? 6;
        if (data.notaFinal < minimum) throw new AppError(400, `La nota debe alcanzar el mínimo aprobatorio de ${minimum}`);
        const nextDate = fecha ?? row.fechaAcreditacion;
        const update = await transaction.promocionHistorica.updateMany({ where: { id, version: data.expectedVersion }, data: {
          notaFinal: data.notaFinal, fechaAcreditacion: nextDate, version: { increment: 1 }
        } });
        if (update.count !== 1) throw new AppError(409, 'La promoción histórica cambió; volvé a cargarla');
        await transaction.promocionHistoricaAuditoria.create({ data: {
          promocionHistoricaId: id, version: data.expectedVersion + 1, notaAnterior: row.notaFinal,
          notaNueva: data.notaFinal, fechaAnterior: row.fechaAcreditacion, fechaNueva: nextDate,
          motivo: data.motivo.trim(), actorId: actor.id
        } });
        await latchSpaceIfStudentCompleted({
          tx: transaction, carreraId: row.inscripcionMateria.materia.carreraId,
          espacioCurricularId: row.inscripcionMateria.materia.espacioCurricularId,
          materiaId: row.inscripcionMateria.materiaId, alumnoId: row.alumnoId, newlyApproved: true
        });
        const updated = await transaction.promocionHistorica.findUnique({ where: { id }, include });
        if (!updated) throw new AppError(409, 'La promoción histórica cambió durante la operación; volvé a cargarla');
        return present(updated);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof AppError) throw error;
      return translateConflict(error);
    }
  }
}

export default new PromocionHistoricaService();
