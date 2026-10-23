import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { prisma } from '../src/config/prisma.js';
import examenRepository from '../src/repositories/examenRepository.js';
import examenService from '../src/services/examenService.js';
import estadoAcademicoService from '../src/services/estadoAcademicoService.js';
import { AppError } from '../src/utils/AppError.js';

const restorations: Array<() => void> = [];

function replaceMethod(target: Record<string, unknown>, key: string, replacement: unknown) {
  const original = target[key];
  target[key] = replacement;
  restorations.push(() => {
    if (original === undefined) delete target[key];
    else target[key] = original;
  });
}

afterEach(() => {
  while (restorations.length > 0) restorations.pop()?.();
});

const mesaOrdinaria = {
  id: 7,
  fecha: new Date('2026-10-20T12:00:00.000Z'),
  tipoExamen: 'ORAL',
  llamado: 1
};

test('las consultas ordinarias de examen excluyen mesas históricas y validan sus campos requeridos', async () => {
  let byIdWhere: unknown;
  let listWhere: unknown;
  replaceMethod(prisma.mesa as unknown as Record<string, unknown>, 'findFirst', async (args: any) => {
    byIdWhere = args.where;
    return mesaOrdinaria;
  });
  replaceMethod(prisma.mesa as unknown as Record<string, unknown>, 'findMany', async (args: any) => {
    listWhere = args.where;
    return [mesaOrdinaria];
  });
  replaceMethod(prisma.mesa as unknown as Record<string, unknown>, 'count', async () => 1);

  const found = await examenRepository.findExamenById(7);
  const listed = await examenRepository.findAllExamenes();

  assert.deepEqual(byIdWhere, { id: 7, origen: 'ORDINARIA' });
  assert.deepEqual(listWhere, { origen: 'ORDINARIA' });
  assert.equal(found.fecha, mesaOrdinaria.fecha);
  assert.equal(found.tipoExamen, 'ORAL');
  assert.equal(found.llamado, 1);
  assert.equal(listed.data.length, 1);
});

test('una mesa ordinaria incompleta genera un error de integridad al leerla por id o en la lista', async () => {
  const mesaIncompleta = { ...mesaOrdinaria, fecha: null };
  replaceMethod(prisma.mesa as unknown as Record<string, unknown>, 'findFirst', async () => mesaIncompleta);
  replaceMethod(prisma.mesa as unknown as Record<string, unknown>, 'findMany', async () => [mesaIncompleta]);
  replaceMethod(prisma.mesa as unknown as Record<string, unknown>, 'count', async () => 1);

  await assert.rejects(examenRepository.findExamenById(7), (error: unknown) =>
    error instanceof AppError && error.statusCode === 500
  );
  await assert.rejects(examenRepository.findAllExamenes(), (error: unknown) =>
    error instanceof AppError && error.statusCode === 500
  );
});

test('cerrar una mesa bloquea primero la carrera y fija el espacio en la misma transacción al aprobar su último componente', async () => {
  const originalTransaction = (prisma as any).$transaction;
  const originalGetApproved = estadoAcademicoService.getMateriasAprobadasSet;
  const calls: string[] = [];
  let latchArgs: any;
  estadoAcademicoService.getMateriasAprobadasSet = async () => new Set([8]);
  (prisma as any).$transaction = async (operation: (tx: any) => Promise<unknown>) => operation({
    $queryRaw: async (strings: TemplateStringsArray) => {
      const query = strings.join(' ');
      calls.push(query.includes('carreras') ? 'career-lock' : 'mesa-lock');
      return [];
    },
    mesa: {
      findUnique: async ({ select }: any) => {
        calls.push(select ? 'initial-read' : 'locked-read');
        if (select) return { materia: { carreraId: 4 } };
        return {
          id: 12,
          version: 3,
          estadoMesa: 'EN_PROCESO',
          publicadaEn: null,
          materia: { id: 7, carreraId: 4, espacioCurricularId: 30, notaMinima: 6 },
          tribunales: [
            { profesorId: 1, rolTribunal: 'PRESIDENTE' },
            { profesorId: 2, rolTribunal: 'VOCAL' },
            { profesorId: 3, rolTribunal: 'VOCAL' }
          ],
          inscripciones: [{ id: 21, alumnoId: 41, ausenteBorrador: false, notaBorrador: 8 }]
        };
      },
      update: async ({ data }: any) => ({ id: 12, version: 4, ...data })
    },
    inscripcionExamen: { update: async () => ({}) },
    mesaResultadoAuditoria: { create: async () => ({}) },
    espacioCurricular: {
      findFirst: async () => ({ composicionBloqueadaAt: null, materias: [{ id: 7 }, { id: 8 }] }),
      updateMany: async (args: any) => { calls.push('latch'); latchArgs = args; return { count: 1 }; }
    }
  });

  try {
    await examenRepository.cerrarMesa(12, { id: 1, rol: 'ADMINISTRATIVO' }, 3);
    assert.deepEqual(calls, ['initial-read', 'career-lock', 'mesa-lock', 'locked-read', 'latch']);
    assert.deepEqual(latchArgs.where, { id: 30, carreraId: 4, composicionBloqueadaAt: null });
    assert.ok(latchArgs.data.composicionBloqueadaAt instanceof Date);
  } finally {
    (prisma as any).$transaction = originalTransaction;
    estadoAcademicoService.getMateriasAprobadasSet = originalGetApproved;
  }
});

test('reabrir conserva el latch y lo establece si encuentra resultados aprobados completos de una mesa previa', async () => {
  const originalTransaction = (prisma as any).$transaction;
  const originalGetApproved = estadoAcademicoService.getMateriasAprobadasSet;
  let latchArgs: any;
  estadoAcademicoService.getMateriasAprobadasSet = async () => new Set([8]);
  (prisma as any).$transaction = async (operation: (tx: any) => Promise<unknown>) => operation({
    $queryRaw: async () => [],
    mesa: {
      findUnique: async ({ select }: any) => select
        ? { materia: { carreraId: 4 } }
        : {
            id: 12,
            version: 3,
            estadoMesa: 'FINALIZADA',
            materia: { id: 7, carreraId: 4, espacioCurricularId: 30 },
            inscripciones: [{ id: 21, alumnoId: 41, aprobado: true, notaFinal: 8, ausentePublicado: false }]
          },
      update: async ({ data }: any) => ({ id: 12, version: 4, ...data })
    },
    inscripcionExamen: { update: async () => ({}) },
    mesaResultadoAuditoria: { create: async () => ({}) },
    espacioCurricular: {
      findFirst: async () => ({ composicionBloqueadaAt: null, materias: [{ id: 7 }, { id: 8 }] }),
      updateMany: async (args: any) => { latchArgs = args; return { count: 1 }; }
    }
  });

  try {
    const result = await examenRepository.reabrirMesa(12, 1, 'Revisión', 3);
    assert.equal(result.estadoMesa, 'EN_PROCESO');
    assert.deepEqual(latchArgs.where, { id: 30, carreraId: 4, composicionBloqueadaAt: null });
    assert.ok(latchArgs.data.composicionBloqueadaAt instanceof Date);
  } finally {
    (prisma as any).$transaction = originalTransaction;
    estadoAcademicoService.getMateriasAprobadasSet = originalGetApproved;
  }
});

test('el borrado filtra ORDINARIA y una mesa histórica termina en 404 sin actualizarse', async () => {
  let updateWhere: unknown;
  let attemptedMutation = false;
  replaceMethod(prisma.mesa as unknown as Record<string, unknown>, 'updateMany', async (args: any) => {
    updateWhere = args.where;
    attemptedMutation = true;
    return { count: 0 };
  });
  replaceMethod(prisma.mesa as unknown as Record<string, unknown>, 'findUnique', async () => {
    assert.fail('no debe releer una mesa que no se eliminó');
  });

  await assert.rejects(examenRepository.deleteExamen(12), (error: unknown) =>
    error instanceof AppError && error.statusCode === 404
  );
  assert.deepEqual(updateWhere, { id: 12, origen: 'ORDINARIA' });
  assert.equal(attemptedMutation, true);
});

test('el servicio DELETE responde 404 cuando el ID histórico no está disponible en la consulta ordinaria', async () => {
  replaceMethod(examenRepository as unknown as Record<string, unknown>, 'findExamenById', async () => null);
  replaceMethod(examenRepository as unknown as Record<string, unknown>, 'deleteExamen', async () => {
    assert.fail('no debe invocar el borrado para un ID histórico');
  });

  await assert.rejects(
    examenService.deleteExamen(12, { rol: 'ADMINISTRATIVO' }),
    (error: unknown) => error instanceof AppError && error.statusCode === 404
  );
});
