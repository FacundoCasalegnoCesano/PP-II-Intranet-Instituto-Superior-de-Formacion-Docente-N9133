import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { ROLES } from '../constants/roles.js';
import { AppError } from '../utils/AppError.js';
import { lockCareerForAcademicMutation } from './espacioComposicionLatch.js';
import { anioInstitucionalActual } from '../utils/cicloLectivo.js';

interface HistoricalActor { id: number; rol: string }

function requireAdmin(actor: HistoricalActor | undefined): asserts actor is HistoricalActor {
  if (!actor || actor.rol !== ROLES.ADMINISTRATIVO) throw new AppError(403, 'Solo administrativos pueden crear inscripciones históricas');
}

/** Reuses or creates only the enrollment rows for an existing past offering. */
class InscripcionHistoricaService {
  async crearEspacio(cursadaEspacioId: number, usuarioId: number, actor: HistoricalActor, transaction?: Prisma.TransactionClient) {
    requireAdmin(actor);
    const db = (transaction as any) ?? prisma;
    const offer = await db.cursadaEspacio.findUnique({
      where: { id: cursadaEspacioId },
      select: { componentes: { select: { id: true }, orderBy: { id: 'asc' } } }
    });
    if (!offer || offer.componentes.length < 2) throw new AppError(404, 'Cursada histórica del espacio no encontrada o incompleta');
    return this.crear(offer.componentes[0]!.id, usuarioId, actor, transaction);
  }

  async crear(cursadaId: number, usuarioId: number, actor: HistoricalActor, transaction?: Prisma.TransactionClient) {
    requireAdmin(actor);
    const alumno = await prisma.alumno.findUnique({
      where: { idCuenta: usuarioId },
      select: { idAlumno: true, idCuenta: true, usuario: { select: { apellidoNombre: true, rol: true } } }
    });
    if (!alumno || !(alumno.usuario.rol ?? '').split(',').map((role) => role.trim()).includes(ROLES.ALUMNO)) {
      throw new AppError(404, 'Alumno no encontrado');
    }

    try {
      const createRegistration = async (transaction: Prisma.TransactionClient) => {
        const tx = transaction as any;
        let course = await tx.cursada.findUnique({
          where: { id: cursadaId },
          include: { materia: { select: { id: true, nombre: true, carreraId: true, espacioCurricularId: true } } }
        });
        if (!course) throw new AppError(404, 'La cursada histórica no existe');
        if (course.anioLectivo >= anioInstitucionalActual()) throw new AppError(409, 'La inscripción histórica requiere una cursada de un ciclo anterior');
        await lockCareerForAcademicMutation(transaction, course.materia.carreraId);
        course = await tx.cursada.findUnique({
          where: { id: cursadaId },
          include: { materia: { select: { id: true, nombre: true, carreraId: true, espacioCurricularId: true } } }
        });
        if (!course || course.anioLectivo >= anioInstitucionalActual()) throw new AppError(409, 'La cursada cambió durante la operación; volvé a cargarla');

        const careerEnrollment = await tx.inscripcionCarrera.findFirst({
          where: { usuarioId, carreraId: course.materia.carreraId }, select: { id: true }
        });
        if (!careerEnrollment) throw new AppError(409, 'El alumno no tiene inscripción a la carrera de esta cursada');

        if (course.cursadaEspacioId === null) {
          const existing = await tx.inscripcionMateria.findUnique({
            where: { alumnoId_materiaId_cicloLectivo: { alumnoId: alumno.idAlumno, materiaId: course.materiaId, cicloLectivo: course.anioLectivo } }
          });
          if (existing?.cursadaId && existing.cursadaId !== course.id) {
            throw new AppError(409, `El alumno ya tiene una inscripción incompatible para ${course.materia.nombre} en ${course.anioLectivo}`);
          }
          if (existing?.inscripcionEspacioId) throw new AppError(409, `La inscripción de ${course.materia.nombre} ya pertenece a otro espacio`);
          const row = existing
            ? await tx.inscripcionMateria.update({ where: { id: existing.id }, data: {
                cursadaId: course.id,
                ...(existing.estado === 'BAJA' ? { estado: 'ACTIVA', fechaBaja: null } : {})
              } })
            : await tx.inscripcionMateria.create({ data: {
                alumnoId: alumno.idAlumno, materiaId: course.materiaId, cursadaId: course.id,
                cicloLectivo: course.anioLectivo, estado: 'ACTIVA', fechaBaja: null
              } });
          return row.id;
        }

        const offer = await tx.cursadaEspacio.findUnique({
          where: { id: course.cursadaEspacioId },
          include: { componentes: { include: { materia: { select: { id: true, nombre: true } } }, orderBy: { materiaId: 'asc' } } }
        });
        if (!offer || offer.anioLectivo !== course.anioLectivo || offer.componentes.length < 2 || !offer.componentes.some((component: any) => component.id === course.id)) {
          throw new AppError(409, 'La cursada no pertenece a una oferta histórica completa del espacio');
        }
        const priorParent = await tx.inscripcionEspacio.findUnique({
          where: { alumnoId_cursadaEspacioId: { alumnoId: alumno.idAlumno, cursadaEspacioId: offer.id } },
          include: { componentes: true }
        });
        const componentIds = offer.componentes.map((component: any) => component.materiaId);
        const existingRows = await tx.inscripcionMateria.findMany({
          where: { alumnoId: alumno.idAlumno, materiaId: { in: componentIds }, cicloLectivo: offer.anioLectivo }
        });
        const existingByMatter = new Map(existingRows.map((row: any) => [row.materiaId, row]));
        for (const component of offer.componentes) {
          const existing = existingByMatter.get(component.materiaId) as any;
          if (existing && existing.cursadaId !== null && existing.cursadaId !== component.id) {
            throw new AppError(409, `La materia ${component.materia.nombre} ya está vinculada a otra cursada`);
          }
          if (existing?.inscripcionEspacioId && existing.inscripcionEspacioId !== priorParent?.id) {
            throw new AppError(409, `La materia ${component.materia.nombre} ya pertenece a otra inscripción de espacio`);
          }
        }

        const parent = priorParent ?? await tx.inscripcionEspacio.create({
          data: { alumnoId: alumno.idAlumno, cursadaEspacioId: offer.id, estado: 'ACTIVA', fechaInscripcion: new Date() }
        });
        if (priorParent?.estado === 'BAJA' || priorParent?.fechaBaja) {
          await tx.inscripcionEspacio.update({ where: { id: parent.id }, data: { estado: 'ACTIVA', fechaBaja: null } });
        }
        let linkedId: number | undefined;
        for (const component of offer.componentes) {
          const existing = existingByMatter.get(component.materiaId) as any;
          const row = existing
            ? await tx.inscripcionMateria.update({ where: { id: existing.id }, data: {
                cursadaId: component.id, inscripcionEspacioId: parent.id,
                ...(existing.estado === 'BAJA' ? { estado: 'ACTIVA', fechaBaja: null } : {})
              } })
            : await tx.inscripcionMateria.create({ data: {
                alumnoId: alumno.idAlumno, materiaId: component.materiaId, cursadaId: component.id,
                cicloLectivo: offer.anioLectivo, inscripcionEspacioId: parent.id,
                estado: 'ACTIVA', fechaBaja: null
              } });
          if (component.id === course.id) linkedId = row.id;
        }
        if (!linkedId) throw new AppError(409, 'La materia seleccionada ya no integra la cursada del espacio');
        return linkedId;
      };
      const registrationId = transaction
        ? await createRegistration(transaction)
        : await prisma.$transaction(createRegistration, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return { idInscripcionMateria: registrationId, cursadaId, alumnoId: usuarioId };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error && typeof error === 'object' && 'code' in error && (error as any).code === 'P2034') {
        throw new AppError(409, 'La inscripción histórica cambió durante la operación; reintentá');
      }
      if (error && typeof error === 'object' && 'code' in error && (error as any).code === 'P2002') {
        throw new AppError(409, 'Ya existe una inscripción compatible para esa cursada');
      }
      throw error;
    }
  }
}

export default new InscripcionHistoricaService();
