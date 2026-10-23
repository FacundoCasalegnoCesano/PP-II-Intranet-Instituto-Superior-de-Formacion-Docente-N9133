import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import estadoAcademicoService from '../src/services/estadoAcademicoService.js';
import { latchSpaceIfStudentCompleted, lockCareerForAcademicMutation } from '../src/services/espacioComposicionLatch.js';

const originalGetApproved = estadoAcademicoService.getMateriasAprobadasSet;
afterEach(() => {
  estadoAcademicoService.getMateriasAprobadasSet = originalGetApproved;
});

test('el lock de carrera precede al latch y fija la composición al completar todos los componentes activos', async () => {
  const calls: string[] = [];
  let latchWhere: unknown;
  let latchData: unknown;
  const tx: any = {
    $queryRaw: async () => { calls.push('career-lock'); return []; },
    espacioCurricular: {
      findFirst: async (args: any) => {
        calls.push('read-space');
        assert.deepEqual(args.where, { id: 30, carreraId: 4 });
      return { activo: false, composicionBloqueadaAt: null, materias: [{ id: 7, activo: false }, { id: 8, activo: false }] };
      },
      updateMany: async (args: any) => {
        calls.push('latch');
        latchWhere = args.where;
        latchData = args.data;
        return { count: 1 };
      }
    }
  };
  estadoAcademicoService.getMateriasAprobadasSet = async () => new Set([8]);

  await lockCareerForAcademicMutation(tx, 4);
  await latchSpaceIfStudentCompleted({
    tx,
    carreraId: 4,
    espacioCurricularId: 30,
    materiaId: 7,
    alumnoId: 41,
    newlyApproved: true
  });

  assert.deepEqual(calls, ['career-lock', 'read-space', 'latch']);
  assert.deepEqual(latchWhere, { id: 30, carreraId: 4, composicionBloqueadaAt: null });
  assert.ok((latchData as any).composicionBloqueadaAt instanceof Date);
});

test('la composición ya bloqueada permanece monotónica aunque cambie el estado activo del espacio', async () => {
  let writes = 0;
  let approvedReads = 0;
  const tx: any = {
    espacioCurricular: {
      findFirst: async () => ({ composicionBloqueadaAt: new Date('2026-01-01'), materias: [{ id: 7 }, { id: 8 }] }),
      updateMany: async () => { writes += 1; return { count: 1 }; }
    }
  };
  estadoAcademicoService.getMateriasAprobadasSet = async () => { approvedReads += 1; return new Set([8]); };

  await latchSpaceIfStudentCompleted({ tx, carreraId: 4, espacioCurricularId: 30, materiaId: 7, alumnoId: 41, newlyApproved: true });
  assert.equal(writes, 0);
  assert.equal(approvedReads, 0);

  tx.espacioCurricular.findFirst = async () => ({ composicionBloqueadaAt: null, materias: [{ id: 7 }] });
  await latchSpaceIfStudentCompleted({ tx, carreraId: 4, espacioCurricularId: 30, materiaId: 7, alumnoId: 41, newlyApproved: true });
  assert.equal(writes, 0);

  await latchSpaceIfStudentCompleted({ tx, carreraId: 4, espacioCurricularId: 30, materiaId: 7, alumnoId: 41, newlyApproved: false });
  assert.equal(writes, 0);
});
