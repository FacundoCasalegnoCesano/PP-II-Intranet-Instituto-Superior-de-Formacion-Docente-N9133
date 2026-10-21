import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import materiaRepository from '../src/repositories/materiaRepository.js';
import estadoAcademicoService from '../src/services/estadoAcademicoService.js';
import espacioCurricularService from '../src/services/espacioCurricularService.js';
import {
  createEspacioCorrelatividadSchema,
  createEspacioCurricularSchema,
  updateEspacioCurricularSchema
} from '../src/validations/espacioCurricularValidation.js';

const restorations: Array<() => void> = [];
function replace(target: object, key: PropertyKey, value: unknown) {
  const record = target as Record<PropertyKey, unknown>;
  const original = record[key];
  record[key] = value;
  restorations.push(() => { record[key] = original; });
}
function transaction(db: object) {
  replace(materiaRepository, 'withTransaction', async (operation: (tx: unknown) => Promise<unknown>) => operation(db));
  replace(materiaRepository, 'getMixedCorrelationEdges', async () => []);
}
function spaceRecord(overrides: Record<string, unknown> = {}) {
  return { id: 7, carreraId: 3, nombre: 'Práctica', descripcion: null, activo: false, composicionBloqueadaAt: null, materias: [{ id: 10 }, { id: 11 }], ...overrides };
}

afterEach(() => { while (restorations.length) restorations.pop()?.(); });

test('la configuración admite borradores con cero o una materia y no permite duplicados ni campos extra', () => {
  const valid = { nombre: 'Práctica', carreraId: 3, componentesIds: [10, 11] };
  assert.equal(createEspacioCurricularSchema.validate(valid).error, undefined);
  assert.ok(createEspacioCurricularSchema.validate({ ...valid, componentesIds: [10, 10] }).error);
  assert.equal(createEspacioCurricularSchema.validate({ ...valid, componentesIds: [10] }).error, undefined);
  assert.equal(createEspacioCurricularSchema.validate({ ...valid, componentesIds: [] }).error, undefined);
  assert.ok(createEspacioCurricularSchema.validate({ ...valid, activo: true }).error);
  assert.ok(updateEspacioCurricularSchema.validate({ activo: true }).error);
  assert.equal(createEspacioCurricularSchema.validate({ ...valid, correlatividades: [] }).error, undefined);
  assert.equal(createEspacioCurricularSchema.validate({ ...valid, correlatividades: [
    { materiaRequeridaId: 12, aplicaCursado: true, aplicaRendir: false }
  ] }).error, undefined);
  assert.ok(createEspacioCurricularSchema.validate({ ...valid, correlatividades: [
    { materiaRequeridaId: 12, aplicaCursado: true, aplicaRendir: false },
    { materiaRequeridaId: 12, aplicaCursado: false, aplicaRendir: true }
  ] }).error);
});

test('las correlatividades validan el requisito XOR y piden una instancia de aplicación', () => {
  const base = { aplicaCursado: true, aplicaRendir: false };
  assert.equal(createEspacioCorrelatividadSchema.validate({ ...base, materiaRequeridaId: 10 }).error, undefined);
  assert.equal(createEspacioCorrelatividadSchema.validate({ ...base, espacioRequeridoId: 7 }).error, undefined);
  assert.ok(createEspacioCorrelatividadSchema.validate({ ...base, materiaRequeridaId: 10, espacioRequeridoId: 7 }).error);
  assert.ok(createEspacioCorrelatividadSchema.validate({ ...base, aplicaCursado: false, aplicaRendir: false, materiaRequeridaId: 10 }).error);
});

test('crear configura en transacción, deja inactivo y asigna las materias al espacio', async () => {
  const calls: Array<{ model: string; args: any }> = [];
  const db = {
    $queryRaw: async () => [],
    carrera: { findUnique: async () => ({ id: 3, activo: true }) },
    materia: {
      findMany: async () => [{ id: 10, espacioCurricularId: null }, { id: 11, espacioCurricularId: null }],
      findUnique: async () => ({ carreraId: 3 }),
      updateMany: async (args: any) => { calls.push({ model: 'materia.updateMany', args }); return { count: 2 }; }
    },
    correlatividad: { findMany: async () => [], updateMany: async () => ({ count: 0 }) },
    espacioCorrelatividad: { findFirst: async () => null, create: async (args: any) => { calls.push({ model: 'prerequisite.create', args }); return args.data; } },
    espacioCurricular: {
      create: async (args: any) => { calls.push({ model: 'espacio.create', args }); return { id: 7 }; },
      findUnique: async () => ({ id: 7, carreraId: 3, activo: false }),
      findMany: async () => []
    }
  };
  transaction(db);
  replace(materiaRepository, 'getMixedCorrelationEdges', async () => []);
  const result = await espacioCurricularService.create({
    nombre: ' Práctica ', carreraId: 3, componentesIds: [10, 11],
    correlatividades: [{ materiaRequeridaId: 12, aplicaCursado: true, aplicaRendir: false }]
  });
  assert.equal(calls[0].args.data.activo, false);
  assert.equal(calls[0].args.data.nombre, 'Práctica');
  assert.equal(calls[2].args.data.espacioCurricularId, 7);
  assert.ok(calls.some(call => call.model === 'prerequisite.create'));
  assert.equal((result as any).activo, false);
});

test('crear rechaza destino inválido dentro de la transacción y no confirma el espacio', async () => {
  const calls: string[] = [];
  const db = {
    $queryRaw: async () => [],
    carrera: { findUnique: async () => ({ id: 3, activo: true }) },
    materia: {
      findMany: async () => [{ id: 10, espacioCurricularId: null }, { id: 11, espacioCurricularId: null }],
      findUnique: async () => ({ carreraId: 4 }),
      updateMany: async () => ({ count: 2 })
    },
    correlatividad: { findMany: async () => [], updateMany: async () => ({ count: 0 }) },
    espacioCurricular: {
      create: async () => { calls.push('space.create'); return { id: 7 }; },
      findUnique: async () => ({ id: 7, carreraId: 3, activo: false, materias: [{ id: 10 }, { id: 11 }] }),
      findMany: async () => []
    },
    espacioCorrelatividad: { findFirst: async () => null, create: async () => { calls.push('prerequisite.create'); } }
  };
  transaction(db);
  await assert.rejects(espacioCurricularService.create({
    nombre: 'Práctica', carreraId: 3, componentesIds: [10, 11],
    correlatividades: [{ materiaRequeridaId: 12, aplicaCursado: true, aplicaRendir: false }]
  }), /misma carrera/);
  assert.deepEqual(calls, ['space.create']);
});

test('crear exige revisión antes de suspender reglas propias activas', async () => {
  const calls: string[] = [];
  const db = {
    $queryRaw: async () => [],
    carrera: { findUnique: async () => ({ id: 3, activo: true }) },
    materia: { findMany: async () => [{ id: 10, espacioCurricularId: null }, { id: 11, espacioCurricularId: null }] },
    correlatividad: {
      findMany: async () => [{ id: 20, materiaOrigenId: 10, materiaRequeridaId: 12, aplicaCursado: false, aplicaRendir: true }],
      updateMany: async () => { calls.push('suspend'); return { count: 1 }; }
    },
    espacioCurricular: { create: async () => { calls.push('space.create'); return { id: 7 }; } }
  };
  transaction(db);
  await assert.rejects(espacioCurricularService.create({ nombre: 'Práctica', carreraId: 3, componentesIds: [10, 11] }), /Revisá y confirmá/);
  assert.deepEqual(calls, []);
});

test('crear suspende las reglas propias confirmadas en la misma transacción', async () => {
  const calls: Array<{ model: string; args: any }> = [];
  const db = {
    $queryRaw: async () => [],
    carrera: { findUnique: async () => ({ id: 3, activo: true }) },
    materia: {
      findMany: async () => [{ id: 10, espacioCurricularId: null }, { id: 11, espacioCurricularId: null }],
      updateMany: async (args: any) => { calls.push({ model: 'materia.updateMany', args }); return { count: 2 }; }
    },
    correlatividad: {
      findMany: async () => [{ id: 20, materiaOrigenId: 10, materiaRequeridaId: 12, aplicaCursado: false, aplicaRendir: true }],
      updateMany: async (args: any) => { calls.push({ model: 'correlatividad.updateMany', args }); return { count: 1 }; }
    },
    espacioCurricular: {
      create: async (args: any) => { calls.push({ model: 'espacio.create', args }); return { id: 7 }; },
      findUnique: async () => ({ id: 7, carreraId: 3, activo: false })
    }
  };
  transaction(db);
  await espacioCurricularService.create({
    nombre: 'Práctica', carreraId: 3, componentesIds: [10, 11], revisarCorrelatividadesComponentes: true
  });
  const suspension = calls.find(call => call.model === 'correlatividad.updateMany');
  assert.deepEqual(suspension?.args.data, { suspendidaPorEspacio: true });
  assert.deepEqual(suspension?.args.where.id, { in: [20] });
});

test('composición se bloquea y persiste el latch si la cohorte ya completó todas sus materias', async () => {
  const calls: string[] = [];
  const db = {
    $queryRaw: async () => [],
    carrera: { findUnique: async () => ({ id: 3, activo: true }) },
    espacioCurricular: {
      findUnique: async () => spaceRecord(),
      update: async (args: any) => { calls.push(`space:${JSON.stringify(args.data)}`); return spaceRecord(args.data); }
    },
    inscripcionExamen: { findMany: async () => [{ alumnoId: 9 }] },
    homologacion: { findMany: async () => [] },
    calificacion: { findMany: async () => [] },
    materia: { updateMany: async () => { calls.push('members-changed'); return { count: 0 }; } }
  };
  transaction(db);
  replace(estadoAcademicoService, 'getMateriasAprobadasSet', async () => new Set([10, 11]));
  await assert.rejects(
    espacioCurricularService.update(7, { componentesIds: [10, 12] }),
    /composición quedó bloqueada/
  );
  assert.equal(calls.length, 1);
  assert.match(calls[0], /composicionBloqueadaAt/);
});

test('cambiar composición rechaza ofertas activas o cualquier matrícula histórica antes de desvincular materias', async () => {
  for (const counts of [{ offerings: 1, enrollments: 0 }, { offerings: 0, enrollments: 1 }]) {
    const calls: string[] = [];
    const db = {
      $queryRaw: async () => [],
      carrera: { findUnique: async () => ({ id: 3, activo: true }) },
      espacioCurricular: { findUnique: async () => spaceRecord(), update: async () => { calls.push('space.update'); } },
      cursadaEspacio: { count: async ({ where }: any) => { assert.deepEqual(where, { espacioCurricularId: 7, activo: true }); return counts.offerings; } },
      inscripcionEspacio: { count: async ({ where }: any) => { assert.deepEqual(where, { cursadaEspacio: { espacioCurricularId: 7 } }); return counts.enrollments; } },
      inscripcionExamen: { findMany: async () => [] }, homologacion: { findMany: async () => [] }, calificacion: { findMany: async () => [] },
      materia: { findMany: async () => [{ id: 10, espacioCurricularId: 7 }, { id: 12, espacioCurricularId: null }], updateMany: async () => { calls.push('members.update'); } }
    };
    transaction(db);
    await assert.rejects(espacioCurricularService.update(7, { componentesIds: [10, 12] }), /ofertas activas o matrículas registradas/);
    assert.deepEqual(calls, []);
  }
});

test('cambiar composición sin oferta activa ni matrículas permite actualizar aunque existan ofertas inactivas', async () => {
  const calls: string[] = [];
  const db = {
    $queryRaw: async () => [],
    carrera: { findUnique: async () => ({ id: 3, activo: true }) },
    espacioCurricular: { findUnique: async () => spaceRecord(), update: async (args: any) => { calls.push(`space:${JSON.stringify(args.data)}`); return spaceRecord(args.data); } },
    cursadaEspacio: { count: async ({ where }: any) => { assert.equal(where.activo, true); return 0; } },
    inscripcionEspacio: { count: async () => 0 },
    inscripcionExamen: { findMany: async () => [] }, homologacion: { findMany: async () => [] }, calificacion: { findMany: async () => [] },
    materia: { findMany: async () => [{ id: 10, espacioCurricularId: 7 }, { id: 12, espacioCurricularId: null }], updateMany: async () => { calls.push('members.update'); return { count: 1 }; } },
    correlatividad: { findMany: async () => [], updateMany: async () => ({ count: 0 }) }
  };
  transaction(db);
  await espacioCurricularService.update(7, { componentesIds: [10, 12] });
  assert.ok(calls.includes('members.update'));
});

test('al reducir un espacio activo a menos de dos materias lo devuelve a configuración', async () => {
  let updateData: any;
  const db = {
    $queryRaw: async () => [],
    carrera: { findUnique: async () => ({ id: 3, activo: true }) },
    espacioCurricular: {
      findUnique: async () => spaceRecord({ activo: true }),
      update: async ({ data }: any) => { updateData = data; return spaceRecord({ activo: data.activo }); }
    },
    cursadaEspacio: { count: async () => 0 }, inscripcionEspacio: { count: async () => 0 },
    inscripcionExamen: { findMany: async () => [] }, homologacion: { findMany: async () => [] }, calificacion: { findMany: async () => [] },
    materia: { findMany: async () => [{ id: 10, espacioCurricularId: 7 }], updateMany: async () => ({ count: 1 }) },
    correlatividad: { findMany: async () => [], updateMany: async () => ({ count: 0 }) }
  };
  transaction(db);

  await espacioCurricularService.update(7, { componentesIds: [10] });

  assert.equal(updateData.activo, false);
});

test('cambiar miembros rechaza los ciclos que aparecen al incorporar una correlativa del espacio', async () => {
  const calls: string[] = [];
  const db = {
    $queryRaw: async () => [],
    carrera: { findUnique: async () => ({ id: 3, activo: true }) },
    espacioCurricular: { findUnique: async () => spaceRecord({ materias: [{ id: 11 }, { id: 12 }] }), update: async () => { calls.push('space.update'); } },
    cursadaEspacio: { count: async () => 0 }, inscripcionEspacio: { count: async () => 0 },
    inscripcionExamen: { findMany: async () => [] }, homologacion: { findMany: async () => [] }, calificacion: { findMany: async () => [] },
    materia: { findMany: async () => [{ id: 10, espacioCurricularId: null }, { id: 11, espacioCurricularId: 7 }], updateMany: async () => { calls.push('members.update'); } },
    correlatividad: { findMany: async () => [], updateMany: async () => ({ count: 0 }) }
  };
  transaction(db);
  replace(materiaRepository, 'getMixedCorrelationEdges', async () => [
    { from: 'S:7', to: 'M:10', kind: 'SPACE', aplicaCursado: true, aplicaRendir: true },
    { from: 'M:11', to: 'S:7', kind: 'MEMBERSHIP', aplicaCursado: true, aplicaRendir: true }
  ]);

  await assert.rejects(espacioCurricularService.update(7, { componentesIds: [10, 11] }), /generaría un ciclo/);

  assert.deepEqual(calls, []);
});

test('cambiar composición también exige revisar y suspende reglas activas de miembros retenidos o desvinculados', async () => {
  const calls: Array<{ model: string; args: any }> = [];
  const db = {
    $queryRaw: async () => [],
    carrera: { findUnique: async () => ({ id: 3, activo: true }) },
    espacioCurricular: { findUnique: async () => spaceRecord(), update: async (args: any) => { calls.push({ model: 'space.update', args }); return spaceRecord(args.data); } },
    cursadaEspacio: { count: async () => 0 }, inscripcionEspacio: { count: async () => 0 },
    inscripcionExamen: { findMany: async () => [] }, homologacion: { findMany: async () => [] }, calificacion: { findMany: async () => [] },
    materia: { findMany: async () => [{ id: 10, espacioCurricularId: 7 }, { id: 12, espacioCurricularId: null }], updateMany: async (args: any) => { calls.push({ model: 'materia.updateMany', args }); return { count: 1 }; } },
    correlatividad: {
      findMany: async ({ where }: any) => {
        assert.deepEqual(where.materiaOrigenId.in, [10, 11, 12]);
        return [{ id: 30 }];
      },
      updateMany: async (args: any) => { calls.push({ model: 'correlatividad.updateMany', args }); return { count: 1 }; }
    }
  };
  transaction(db);
  await assert.rejects(espacioCurricularService.update(7, { componentesIds: [10, 12] }), /Revisá y confirmá/);
  assert.ok(!calls.some(call => call.model === 'materia.updateMany'));
  await espacioCurricularService.update(7, { componentesIds: [10, 12], revisarCorrelatividadesComponentes: true });
  const suspension = calls.find(call => call.model === 'correlatividad.updateMany');
  assert.deepEqual(suspension?.args.data, { suspendidaPorEspacio: true });
});

test('activar rechaza espacios con menos de dos materias', async () => {
  const db = {
    $queryRaw: async () => [],
    carrera: { findUnique: async () => ({ id: 3, activo: true }) },
    espacioCurricular: {
      findUnique: async () => spaceRecord({ materias: [{ id: 10 }] }),
      update: async () => { throw new Error('No debía activarse'); }
    }
  };
  transaction(db);
  await assert.rejects(espacioCurricularService.activate(7), /al menos dos materias/);
});

test('quitar correlatividad coordina con matrículas mediante lock de carrera dentro de la transacción', async () => {
  const calls: string[] = [];
  const db = {
    $queryRaw: async () => { calls.push('career-lock'); return []; },
    carrera: { findUnique: async () => ({ id: 3, activo: true }) },
    espacioCurricular: { findUnique: async () => spaceRecord() },
    espacioCorrelatividad: {
      deleteMany: async ({ where }: any) => {
        calls.push('prerequisite.delete');
        assert.deepEqual(where, { id: 42, espacioOrigenId: 7 });
        return { count: 1 };
      }
    }
  };
  transaction(db);

  await espacioCurricularService.removePrerequisite(7, 42);

  assert.deepEqual(calls, ['career-lock', 'prerequisite.delete']);
});

test('quitar correlatividad devuelve 404 si no existe en el espacio', async () => {
  const calls: string[] = [];
  const db = {
    $queryRaw: async () => { calls.push('career-lock'); return []; },
    carrera: { findUnique: async () => ({ id: 3, activo: true }) },
    espacioCurricular: { findUnique: async () => spaceRecord() },
    espacioCorrelatividad: { deleteMany: async () => ({ count: 0 }) }
  };
  transaction(db);

  await assert.rejects(espacioCurricularService.removePrerequisite(7, 42), /Correlatividad no encontrada/);
  assert.deepEqual(calls, ['career-lock']);
});
