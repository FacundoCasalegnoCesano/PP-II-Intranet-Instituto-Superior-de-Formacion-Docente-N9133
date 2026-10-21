import { pathToFileURL } from 'node:url';
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { evaluarCursada, type TrayectoriaSnapshot } from '../domain/academico/trayectoriaAcademica.js';

type BackfillClient = PrismaClient;
type BackfillTx = Prisma.TransactionClient;

export function parseApplyMode(args: string[]): boolean {
  if (args.some(arg => arg !== '--apply' && arg !== '--dry-run') || args.length > 1) {
    throw new Error('Usage: spaces:backfill-latches [--dry-run|--apply]');
  }
  return args.includes('--apply');
}

async function computeCompletedSpaceIds(tx: BackfillTx): Promise<Set<number>> {
  // Lock careers before reading academic rows so all writers using the shared
  // career lock serialize with this one-off reconciliation.
  await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM carreras ORDER BY id FOR UPDATE`;
  const spaces = await tx.espacioCurricular.findMany({
    where: { activo: true, carreraId: { not: null }, composicionBloqueadaAt: null },
    select: { id: true, carreraId: true, materias: { select: { id: true } } }
  });
  const eligibleSpaces = spaces.filter(space => space.carreraId !== null && space.materias.length >= 2);
  const componentIds = [...new Set(eligibleSpaces.flatMap(space => space.materias.map(materia => materia.id)))];
  if (componentIds.length === 0) return new Set();

  const [exams, homologations, enrollments] = await Promise.all([
    tx.inscripcionExamen.findMany({
      where: { aprobado: true, notaFinal: { not: null }, fechaBaja: null, mesa: { materiaId: { in: componentIds } } },
      select: { alumnoId: true, mesa: { select: { materiaId: true } } }
    }),
    tx.homologacion.findMany({
      where: { estado: 'APROBADA', calificacion: { not: null }, materiaId: { in: componentIds } },
      select: { alumnoId: true, materiaId: true }
    }),
    tx.inscripcionMateria.findMany({
      where: { estado: { not: 'BAJA' }, materiaId: { in: componentIds }, cursadaId: { not: null } },
      include: {
        alumno: { select: { idAlumno: true, idCuenta: true } },
        cursada: { include: { materia: true, calificaciones: true, asistencias: true } }
      }
    })
  ]);

  const approvedByStudent = new Map<number, Set<number>>();
  const markApproved = (alumnoId: number, materiaId: number) => {
    const approved = approvedByStudent.get(alumnoId) ?? new Set<number>();
    approved.add(materiaId);
    approvedByStudent.set(alumnoId, approved);
  };
  for (const exam of exams) markApproved(exam.alumnoId, exam.mesa.materiaId);
  for (const homologation of homologations) markApproved(homologation.alumnoId, homologation.materiaId);

  const evaluadoEn = new Date();
  for (const enrollment of enrollments) {
    const cursada = enrollment.cursada;
    if (!cursada || cursada.materiaId !== enrollment.materiaId) continue;
    const snapshot: TrayectoriaSnapshot = {
      alumnoUsuarioId: enrollment.alumno.idCuenta,
      idAlumno: enrollment.alumnoId,
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
      calificaciones: cursada.calificaciones,
      asistencias: cursada.asistencias
    };
    if (evaluarCursada(snapshot, evaluadoEn).estado === 'PROMOCIONADO') {
      markApproved(enrollment.alumnoId, cursada.materiaId);
    }
  }

  const completedSpaces = new Set<number>();
  for (const space of eligibleSpaces) {
    const studentIds = [...approvedByStudent.keys()];
    if (studentIds.some(alumnoId => {
      const approved = approvedByStudent.get(alumnoId)!;
      return space.materias.every(materia => approved.has(materia.id));
    })) completedSpaces.add(space.id);
  }
  return completedSpaces;
}

export async function backfillSpaceCompositionLatches(apply: boolean, client: BackfillClient = prisma): Promise<number> {
  if (!apply) {
    const count = await client.$transaction(tx => computeCompletedSpaceIds(tx));
    console.info(`[spaces:backfill-latches] mode=dry-run spaces=${count.size}`);
    return count.size;
  }

  const count = await client.$transaction(async tx => {
    const completedSpaces = await computeCompletedSpaceIds(tx);
    for (const spaceId of completedSpaces) {
      await tx.espacioCurricular.updateMany({
        where: { id: spaceId, activo: true, composicionBloqueadaAt: null },
        data: { composicionBloqueadaAt: new Date() }
      });
    }
    return completedSpaces.size;
  });
  console.info(`[spaces:backfill-latches] mode=apply spaces=${count}`);
  return count;
}

async function main(): Promise<void> {
  try {
    await backfillSpaceCompositionLatches(parseApplyMode(process.argv.slice(2)));
  } catch (error) {
    const failure = error as { name?: string; code?: string; message?: string };
    if (failure?.message?.startsWith('Usage:')) {
      console.error(failure.message);
      process.exitCode = 2;
    } else {
      console.error(`[spaces:backfill-latches] failed name=${failure?.name ?? 'Error'} code=${failure?.code ?? 'unknown'}`);
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
