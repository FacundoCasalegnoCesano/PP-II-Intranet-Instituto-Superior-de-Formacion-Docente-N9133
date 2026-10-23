import type { Prisma } from '@prisma/client';
import estadoAcademicoService from './estadoAcademicoService.js';

type Transaction = Prisma.TransactionClient;

export async function lockCareerForAcademicMutation(tx: Transaction, carreraId: number): Promise<void> {
  await tx.$queryRaw`SELECT id FROM carreras WHERE id = ${carreraId} FOR UPDATE`;
}

export async function latchSpaceIfStudentCompleted(input: {
  tx: Transaction;
  carreraId: number;
  espacioCurricularId: number | null;
  materiaId: number;
  alumnoId: number;
  newlyApproved: boolean;
}): Promise<void> {
  const { tx, carreraId, espacioCurricularId, materiaId, alumnoId, newlyApproved } = input;
  if (!newlyApproved || espacioCurricularId === null) return;

  const space = await tx.espacioCurricular.findFirst({
    where: { id: espacioCurricularId, carreraId },
    select: {
      composicionBloqueadaAt: true,
      materias: { select: { id: true } }
    }
  });
  if (!space || space.composicionBloqueadaAt || space.materias.length < 2) return;

  const approved = await estadoAcademicoService.getMateriasAprobadasSet(alumnoId);
  approved.add(materiaId);
  if (!space.materias.every((materia) => approved.has(materia.id))) return;

  await tx.espacioCurricular.updateMany({
    where: { id: espacioCurricularId, carreraId, composicionBloqueadaAt: null },
    data: { composicionBloqueadaAt: new Date() }
  });
}
