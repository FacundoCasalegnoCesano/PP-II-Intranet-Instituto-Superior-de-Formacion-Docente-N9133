import type { Prisma } from '@prisma/client';
import type { CalificacionSnapshot } from '../domain/academico/calificaciones.js';
import { evaluarCursada, type TrayectoriaSnapshot } from '../domain/academico/trayectoriaAcademica.js';
import { latchSpaceIfStudentCompleted } from './espacioComposicionLatch.js';

export async function recomputeSpaceCompletionForPromotions(input: {
  tx: Prisma.TransactionClient;
  cursadaId: number;
  carreraId: number;
  alumnoIds: number[];
}): Promise<void> {
  const { tx, cursadaId, carreraId } = input;
  const alumnoIds = [...new Set(input.alumnoIds)];
  if (alumnoIds.length === 0) return;

  const cursada = await tx.cursada.findUnique({ where: { id: cursadaId }, include: { materia: true } });
  if (!cursada || cursada.materia.carreraId !== carreraId || !cursada.materia.esPromocionable) return;

  const [alumnos, calificaciones, asistencias] = await Promise.all([
    tx.alumno.findMany({ where: { idAlumno: { in: alumnoIds } }, select: { idAlumno: true, idCuenta: true } }),
    tx.calificacion.findMany({ where: { cursadaId }, select: {
      id: true, alumnoId: true, tipoCalificacion: true, numero: true, nota: true, parcialOriginalId: true
    } }),
    tx.asistencia.findMany({ where: { cursadaId }, select: {
      alumnoId: true, fecha: true, presente: true, justificado: true
    } })
  ]);

  for (const alumno of alumnos) {
    const snapshot: TrayectoriaSnapshot = {
      alumnoUsuarioId: alumno.idCuenta,
      idAlumno: alumno.idAlumno,
      cursada: {
        id: cursada.id,
        materiaId: cursada.materiaId,
        anioLectivo: cursada.anioLectivo,
        periodo: cursada.periodo,
        activo: cursada.activo
      },
      materia: {
        id: cursada.materia.id,
        nombre: cursada.materia.nombre,
        carreraId: cursada.materia.carreraId,
        notaMinima: cursada.materia.notaMinima,
        notaPromocion: cursada.materia.notaPromocion,
        asistenciaRequerida: cursada.materia.asistenciaRequerida,
        tpRequeridos: cursada.materia.tpRequeridos,
        esPromocionable: cursada.materia.esPromocionable,
        modalidad: cursada.materia.modalidad,
        regimen: cursada.materia.regimen,
        tipoEspacio: cursada.materia.tipoEspacio,
        aniosRegularidad: cursada.materia.aniosRegularidad
      },
      calificaciones: calificaciones as CalificacionSnapshot[],
      asistencias
    };
    if (evaluarCursada(snapshot, new Date()).estado !== 'PROMOCIONADO') continue;

    await latchSpaceIfStudentCompleted({
      tx,
      carreraId,
      espacioCurricularId: cursada.materia.espacioCurricularId,
      materiaId: cursada.materiaId,
      alumnoId: alumno.idAlumno,
      newlyApproved: true
    });
  }
}
