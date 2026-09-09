import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import materiaRepository from '../src/repositories/materiaRepository.js';
import carreraRepository from '../src/repositories/carreraRepository.js';
import materiaService from '../src/services/materiaService.js';

const restorations: Array<() => void> = [];

function replaceMethod<T extends object, K extends keyof T>(
  target: T,
  key: K,
  replacement: T[K]
) {
  const original = target[key];
  target[key] = replacement;
  restorations.push(() => {
    target[key] = original;
  });
}

function materiaInput(overrides: Record<string, unknown> = {}) {
  return {
    nombre: 'Residencia',
    cargaHoraria: 96,
    tipoEspacio: 'MATERIA',
    carreraId: 1,
    cursoAnio: 1,
    ...overrides
  } as any;
}

function transactionStub(tx: object = {}) {
  let callbacks = 0;
  let committed = false;
  replaceMethod(materiaRepository, 'withTransaction', async (operation: any) => {
    callbacks += 1;
    const result = await operation(tx);
    committed = true;
    return result;
  });
  return {
    tx,
    callbacks: () => callbacks,
    committed: () => committed
  };
}

afterEach(() => {
  while (restorations.length > 0) restorations.pop()?.();
});

test('createMateria comparte tx entre curso, materia y correlativas', async () => {
  const transaction = transactionStub();
  const tx = transaction.tx;
  const calls: Array<{ method: string; db: unknown }> = [];
  let persisted: any;
  let replaced: any;

  replaceMethod(carreraRepository, 'findById', async () => ({
    id: 1,
    nombre: 'Profesorado',
    duracionAnios: 4
  }) as any);
  replaceMethod(materiaRepository, 'findByCareerAndName', async (...args: any[]) => {
    calls.push({ method: 'findByCareerAndName', db: args[3] });
    return null;
  });
  replaceMethod(materiaRepository, 'resolveCursoId', async (...args: any[]) => {
    calls.push({ method: 'resolveCursoId', db: args[3] });
    return 21;
  });
  replaceMethod(materiaRepository, 'create', async (...args: any[]) => {
    calls.push({ method: 'create', db: args[1] });
    persisted = args[0];
    return { id: 30, carreraId: 1 };
  });
  replaceMethod(materiaRepository, 'findById', async (id: number, db: unknown) => {
    calls.push({ method: `findById:${id}`, db });
    return { id, carreraId: 1, activo: true };
  });
  replaceMethod(materiaRepository, 'getCorrelativityEdges', async (...args: any[]) => {
    calls.push({ method: 'getCorrelativityEdges', db: args[1] });
    return [];
  });
  replaceMethod(materiaRepository, 'getIncidentCorrelativityEdges', async (...args: any[]) => {
    calls.push({ method: 'getIncidentCorrelativityEdges', db: args[1] });
    return [];
  });
  replaceMethod(materiaRepository, 'replaceCorrelatividades', async (...args: any[]) => {
    calls.push({ method: 'replaceCorrelatividades', db: args[2] });
    replaced = args;
  });

  await materiaService.createMateria(materiaInput({ correlativasIds: [7, 8] }));

  assert.equal(persisted.cursoId, 21);
  assert.equal('cursoAnio' in persisted, false);
  assert.equal('correlativasIds' in persisted, false);
  assert.deepEqual(replaced.slice(0, 2), [30, [7, 8]]);
  assert.equal(transaction.callbacks(), 1);
  assert.equal(transaction.committed(), true);
  assert.ok(calls.every(call => call.db === tx));
});

test('updateMateria conserva correlativas cuando correlativasIds es omitido', async () => {
  const transaction = transactionStub();
  const tx = transaction.tx;
  let replaced = false;
  let updated: any;
  const transactionClients: unknown[] = [];

  replaceMethod(materiaRepository, 'findById', async (id: number) => ({
    id,
    carreraId: 1,
    nombre: 'Residencia',
    activo: true,
    curso: { anio: 1 }
  }) as any);
  replaceMethod(carreraRepository, 'findById', async () => ({
    id: 1,
    nombre: 'Profesorado',
    duracionAnios: 4
  }) as any);
  replaceMethod(materiaRepository, 'update', async (...args: any[]) => {
    transactionClients.push(args[2]);
    updated = args[1];
    return { id: args[0], ...args[1] };
  });
  replaceMethod(materiaRepository, 'findByCareerAndName', async (...args: any[]) => {
    transactionClients.push(args[3]);
    return null;
  });
  replaceMethod(materiaRepository, 'getIncidentCorrelativityEdges', async (_id: number, db: unknown) => {
    transactionClients.push(db);
    return [{ materiaOrigenId: 30, materiaRequeridaId: 31 }];
  });
  replaceMethod(materiaRepository, 'findById', async (id: number, db?: unknown) => {
    if (db) transactionClients.push(db);
    return {
      id,
      carreraId: 1,
      nombre: 'Residencia',
      activo: true,
      curso: { anio: 1 }
    } as any;
  });
  replaceMethod(materiaRepository, 'replaceCorrelatividades', async () => {
    replaced = true;
  });

  await materiaService.updateMateria(30, { nombre: 'Residencia renovada' });

  assert.equal(updated.nombre, 'Residencia renovada');
  assert.equal('correlativasIds' in updated, false);
  assert.equal(replaced, false);
  assert.equal(transaction.callbacks(), 1);
  assert.equal(transaction.committed(), true);
  assert.ok(transactionClients.every(client => client === tx));
});

test('updateMateria con [] elimina todas y con ids reemplaza el conjunto completo', async () => {
  const transaction = transactionStub();
  const tx = transaction.tx;
  const replacements: number[][] = [];

  replaceMethod(materiaRepository, 'findById', async (id: number) => ({
    id,
    carreraId: 1,
    nombre: 'Residencia',
    activo: true,
    curso: { anio: 1 }
  }) as any);
  replaceMethod(carreraRepository, 'findById', async () => ({
    id: 1,
    nombre: 'Profesorado',
    duracionAnios: 4
  }) as any);
  replaceMethod(materiaRepository, 'update', async (id: number, data: any) => ({ id, ...data }));
  replaceMethod(materiaRepository, 'findByCareerAndName', async () => null);
  replaceMethod(materiaRepository, 'findCorrelativity', async () => null);
  replaceMethod(materiaRepository, 'getCorrelativityEdges', async () => []);
  replaceMethod(materiaRepository, 'getIncidentCorrelativityEdges', async () => []);
  replaceMethod(materiaRepository, 'findById', async (id: number) => ({
    id,
    carreraId: 1,
    nombre: 'Residencia',
    activo: true
  }) as any);
  replaceMethod(materiaRepository, 'replaceCorrelatividades', async (id: number, ids: number[], db: unknown) => {
    assert.equal(db, tx);
    replacements.push(ids);
    void id;
  });

  await materiaService.updateMateria(30, { correlativasIds: [] });
  assert.equal(transaction.callbacks(), 1);
  await materiaService.updateMateria(30, { correlativasIds: [7, 8] });

  assert.deepEqual(replacements, [[], [7, 8]]);
  assert.equal(transaction.callbacks(), 2);
});

test('createMateria rechaza correlativas repetidas antes de reemplazar', async () => {
  const transaction = transactionStub();
  let replaced = false;

  replaceMethod(carreraRepository, 'findById', async () => ({
    id: 1,
    nombre: 'Profesorado',
    duracionAnios: 4
  }) as any);
  replaceMethod(materiaRepository, 'findByCareerAndName', async () => null);
  replaceMethod(materiaRepository, 'resolveCursoId', async () => 21);
  replaceMethod(materiaRepository, 'create', async () => ({ id: 30, carreraId: 1 }));
  replaceMethod(materiaRepository, 'replaceCorrelatividades', async () => {
    replaced = true;
  });

  await assert.rejects(
    materiaService.createMateria(materiaInput({ correlativasIds: [7, 7] })),
    (error: any) => error.statusCode === 400 && /repetir/i.test(error.message)
  );
  assert.equal(replaced, false);
  assert.equal(transaction.callbacks(), 1);
  assert.equal(transaction.committed(), false);
});

test('updateMateria permite cambiar de carrera si reemplaza salientes y no quedan entrantes incompatibles', async () => {
  const transaction = transactionStub();
  let replaced = false;
  let updated: any;
  const calls: Array<{ method: string; db: unknown }> = [];

  replaceMethod(materiaRepository, 'findById', async (id: number, db?: unknown) => {
    if (db) calls.push({ method: `findById:${id}`, db });
    if (db) return { id, carreraId: 2, nombre: 'Residencia', activo: true };
    return { id, carreraId: 1, nombre: 'Residencia', activo: true, curso: { anio: 1 } };
  });
  replaceMethod(carreraRepository, 'findById', async () => ({ id: 2, nombre: 'Profesorado B', duracionAnios: 4 }) as any);
  replaceMethod(materiaRepository, 'findByCareerAndName', async (...args: any[]) => {
    calls.push({ method: 'findByCareerAndName', db: args[3] });
    return null;
  });
  replaceMethod(materiaRepository, 'resolveCursoId', async (...args: any[]) => {
    calls.push({ method: 'resolveCursoId', db: args[3] });
    return 22;
  });
  replaceMethod(materiaRepository, 'getIncidentCorrelativityEdges', async (...args: any[]) => {
    calls.push({ method: 'getIncidentCorrelativityEdges', db: args[1] });
    return [
    { materiaOrigenId: 30, materiaRequeridaId: 31 }
    ];
  });
  replaceMethod(materiaRepository, 'getCorrelativityEdges', async (...args: any[]) => {
    calls.push({ method: 'getCorrelativityEdges', db: args[1] });
    return [];
  });
  replaceMethod(materiaRepository, 'update', async (id: number, data: any, db: unknown) => {
    assert.equal(db, transaction.tx);
    calls.push({ method: 'update', db });
    updated = data;
    return { id, ...data };
  });
  replaceMethod(materiaRepository, 'replaceCorrelatividades', async (...args: any[]) => {
    calls.push({ method: 'replaceCorrelatividades', db: args[2] });
    replaced = true;
  });

  await materiaService.updateMateria(30, { carreraId: 2, correlativasIds: [] });

  assert.equal(updated.carreraId, 2);
  assert.equal(replaced, true);
  assert.equal(transaction.callbacks(), 1);
  assert.equal(transaction.committed(), true);
  assert.ok(calls.length > 0 && calls.every(call => call.db === transaction.tx));
});

test('updateMateria bloquea carrera nueva si una arista entrante queda cruzada', async () => {
  const transaction = transactionStub();
  let replaced = false;

  replaceMethod(materiaRepository, 'findById', async (id: number, db?: unknown) => {
    if (db) return { id, carreraId: id === 40 ? 2 : 1, nombre: 'Materia', activo: true };
    return { id, carreraId: 1, nombre: 'Materia', activo: true, curso: { anio: 1 } };
  });
  replaceMethod(carreraRepository, 'findById', async () => ({ id: 2, nombre: 'Profesorado B', duracionAnios: 4 }) as any);
  replaceMethod(materiaRepository, 'findByCareerAndName', async () => null);
  replaceMethod(materiaRepository, 'resolveCursoId', async () => 22);
  replaceMethod(materiaRepository, 'getIncidentCorrelativityEdges', async () => [
    { materiaOrigenId: 41, materiaRequeridaId: 40 }
  ]);
  replaceMethod(materiaRepository, 'getCorrelativityEdges', async () => []);
  replaceMethod(materiaRepository, 'update', async (id: number, data: any) => ({ id, ...data }));
  replaceMethod(materiaRepository, 'replaceCorrelatividades', async () => {
    replaced = true;
  });

  await assert.rejects(
    materiaService.updateMateria(40, { carreraId: 2, correlativasIds: [] }),
    (error: any) => error.statusCode === 409 && /carreras distintas/i.test(error.message)
  );
  assert.equal(replaced, false);
  assert.equal(transaction.callbacks(), 1);
  assert.equal(transaction.committed(), false);
});

for (const caso of [
  {
    nombre: 'inexistente',
    required: null,
    error: /no encontrada/i
  },
  {
    nombre: 'inactiva',
    required: { id: 7, carreraId: 1, activo: false },
    error: /inactiva/i
  },
  {
    nombre: 'otra carrera',
    required: { id: 7, carreraId: 2, activo: true },
    error: /misma carrera/i
  },
  {
    nombre: 'autorreferencia',
    required: { id: 30, carreraId: 1, activo: true },
    error: /sí misma/i
  },
  {
    nombre: 'ciclo transitivo',
    required: { id: 7, carreraId: 1, activo: true },
    edges: [
      { materiaOrigenId: 7, materiaRequeridaId: 8 },
      { materiaOrigenId: 8, materiaRequeridaId: 30 }
    ],
    error: /ciclo/i
  }
]) {
  test(`createMateria rechaza correlativa ${caso.nombre} sin persistencia parcial`, async () => {
    const transaction = transactionStub();
    let replaced = false;

    replaceMethod(carreraRepository, 'findById', async () => ({ id: 1, nombre: 'Profesorado', duracionAnios: 4 }) as any);
    replaceMethod(materiaRepository, 'findByCareerAndName', async () => null);
    replaceMethod(materiaRepository, 'resolveCursoId', async () => 21);
    replaceMethod(materiaRepository, 'create', async () => ({ id: 30, carreraId: 1 }));
    replaceMethod(materiaRepository, 'findById', async (id: number) => {
      if (id === 30) return { id, carreraId: 1, activo: true };
      if (caso.required === null && id === 999) return null;
      return caso.required;
    });
    replaceMethod(materiaRepository, 'getCorrelativityEdges', async () => caso.edges ?? []);
    replaceMethod(materiaRepository, 'getIncidentCorrelativityEdges', async () => []);
    replaceMethod(materiaRepository, 'replaceCorrelatividades', async () => {
      replaced = true;
    });

    await assert.rejects(
      materiaService.createMateria(materiaInput({ correlativasIds: [caso.required === null ? 999 : caso.required.id] })),
      (error: any) => caso.error.test(error.message)
    );
    assert.equal(replaced, false);
    assert.equal(transaction.committed(), false);
  });
}

for (const caso of [
  {
    nombre: 'inexistente',
    required: null,
    error: /no encontrada/i
  },
  {
    nombre: 'inactiva',
    required: { id: 7, carreraId: 1, activo: false },
    error: /inactiva/i
  },
  {
    nombre: 'otra carrera',
    required: { id: 7, carreraId: 2, activo: true },
    error: /misma carrera/i
  },
  {
    nombre: 'autorreferencia',
    required: { id: 30, carreraId: 1, activo: true },
    error: /sí misma/i
  },
  {
    nombre: 'ciclo transitivo',
    required: { id: 7, carreraId: 1, activo: true },
    edges: [
      { materiaOrigenId: 7, materiaRequeridaId: 8 },
      { materiaOrigenId: 8, materiaRequeridaId: 30 }
    ],
    error: /ciclo/i
  }
]) {
  test(`updateMateria rechaza correlativa ${caso.nombre} sin persistencia parcial`, async () => {
    const transaction = transactionStub();
    let replaced = false;

    replaceMethod(materiaRepository, 'findById', async (id: number, db?: unknown) => {
      if (id === 30) return { id, carreraId: 1, nombre: 'Residencia', activo: true, curso: { anio: 1 } };
      if (caso.required === null && id === 999) return null;
      return caso.required;
    });
    replaceMethod(carreraRepository, 'findById', async () => ({ id: 1, nombre: 'Profesorado', duracionAnios: 4 }) as any);
    replaceMethod(materiaRepository, 'update', async (id: number, data: any) => ({ id, ...data }));
    replaceMethod(materiaRepository, 'getCorrelativityEdges', async () => caso.edges ?? []);
    replaceMethod(materiaRepository, 'getIncidentCorrelativityEdges', async () => []);
    replaceMethod(materiaRepository, 'replaceCorrelatividades', async () => {
      replaced = true;
    });

    await assert.rejects(
      materiaService.updateMateria(30, { correlativasIds: [caso.required === null ? 999 : caso.required.id] }),
      (error: any) => caso.error.test(error.message)
    );
    assert.equal(replaced, false);
    assert.equal(transaction.callbacks(), 1);
    assert.equal(transaction.committed(), false);
  });
}

test('updateMateria bloquea el ciclo que aparece al reemplazar aristas viejas', async () => {
  const transaction = transactionStub();
  let replaced = false;

  replaceMethod(materiaRepository, 'findById', async (id: number, db?: unknown) => {
    if (db) return { id, carreraId: 1, nombre: 'Materia', activo: true };
    return { id, carreraId: 1, nombre: 'Materia', activo: true, curso: { anio: 1 } };
  });
  replaceMethod(carreraRepository, 'findById', async () => ({ id: 1, nombre: 'Profesorado', duracionAnios: 4 }) as any);
  replaceMethod(materiaRepository, 'getIncidentCorrelativityEdges', async () => [
    { materiaOrigenId: 30, materiaRequeridaId: 7 },
    { materiaOrigenId: 8, materiaRequeridaId: 30 }
  ]);
  replaceMethod(materiaRepository, 'getCorrelativityEdges', async () => [
    { materiaOrigenId: 8, materiaRequeridaId: 30 }
  ]);
  replaceMethod(materiaRepository, 'update', async (id: number, data: any) => ({ id, ...data }));
  replaceMethod(materiaRepository, 'replaceCorrelatividades', async () => {
    replaced = true;
  });

  await assert.rejects(
    materiaService.updateMateria(30, { correlativasIds: [8] }),
    /ciclo/i
  );
  assert.equal(replaced, false);
  assert.equal(transaction.callbacks(), 1);
  assert.equal(transaction.committed(), false);
});
