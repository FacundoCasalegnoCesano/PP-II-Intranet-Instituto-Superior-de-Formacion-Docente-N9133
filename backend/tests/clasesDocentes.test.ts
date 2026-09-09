import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { prisma } from '../src/config/prisma.js';
import alumnoRepository from '../src/repositories/alumnoRepository.js';
import cursadaRepository from '../src/repositories/cursadaRepository.js';
import claseRepository from '../src/repositories/claseRepository.js';
import claseService from '../src/services/claseService.js';
import { ROLES } from '../src/constants/roles.js';
import {
  claseParamsSchema,
  claseWriteSchema
} from '../src/validations/claseValidation.js';

const restorations: Array<() => void> = [];

function replaceMethod(target: any, key: string, replacement: any) {
  const original = target[key];
  target[key] = replacement;
  restorations.push(() => {
    target[key] = original;
  });
}

afterEach(() => {
  while (restorations.length > 0) restorations.pop()?.();
});

const currentCourse = {
  id: 12,
  materiaId: 14,
  anioLectivo: 2026,
  activo: true,
  docenteId: 12
};

const activeEnrollments = [
  { idAlumno: 6, usuarioId: 13, apellidoNombre: 'Lucia Test', dni: 42666888 },
  { idAlumno: 7, usuarioId: 14, apellidoNombre: 'Ada Test', dni: 42666889 }
];

const validPayload = {
  temaDesarrollado: '  Ecuaciones lineales  ',
  asistencias: [
    { alumnoId: 13, presente: true, justificado: false, observacion: null },
    { alumnoId: 14, presente: false, justificado: true, observacion: 'Avisó' }
  ]
};

test('valida fecha calendario estricta y payload de clase completo', () => {
  assert.ok(claseParamsSchema.validate({ cursadaId: 12, fecha: '2026-08-24' }).error === undefined);
  assert.ok(claseParamsSchema.validate({ cursadaId: 12, fecha: '2026-8-24' }).error);
  assert.ok(claseParamsSchema.validate({ cursadaId: 12, fecha: '2026-02-30' }).error);

  const { error, value } = claseWriteSchema.validate(validPayload);
  assert.equal(error, undefined);
  assert.equal(value.temaDesarrollado, 'Ecuaciones lineales');

  assert.ok(claseWriteSchema.validate({ ...validPayload, temaDesarrollado: '   ' }).error);
  assert.ok(claseWriteSchema.validate({ ...validPayload, asistencias: [] }).error);
  assert.ok(claseWriteSchema.validate({
    ...validPayload,
    asistencias: validPayload.asistencias.map(row => ({ ...row, presente: true, justificado: true }))
  }).error);
  assert.ok(claseWriteSchema.validate({ ...validPayload, campoExtra: true }).error);
});

test('rechaza duplicados, alumnos ajenos y cobertura incompleta sin consultar por fila', async () => {
  let consultasAlumnos = 0;
  replaceMethod(claseRepository, 'findCursada', async () => currentCourse);
  replaceMethod(claseRepository, 'findActiveEnrollments', async () => activeEnrollments);
  replaceMethod(alumnoRepository, 'findByUsuarioIds', async (ids: number[]) => {
    consultasAlumnos += 1;
    return ids.map(idCuenta => ({ idCuenta, idAlumno: idCuenta === 13 ? 6 : 7 }));
  });

  await assert.rejects(
    claseService.saveClass(12, '2026-08-24', {
      ...validPayload,
      asistencias: [validPayload.asistencias[0], validPayload.asistencias[0]]
    }, { id: 12, rol: ROLES.ADMINISTRATIVO }),
    (error: any) => error.statusCode === 400 && /duplicad/i.test(error.message)
  );

  await assert.rejects(
    claseService.saveClass(12, '2026-08-24', {
      ...validPayload,
      asistencias: [{ alumnoId: 99, presente: true, justificado: false }]
    }, { id: 12, rol: ROLES.ADMINISTRATIVO }),
    (error: any) => error.statusCode === 400 && /inscripto|cobertura|alumno/i.test(error.message)
  );

  await assert.rejects(
    claseService.saveClass(12, '2026-08-24', {
      ...validPayload,
      asistencias: [validPayload.asistencias[0]]
    }, { id: 12, rol: ROLES.ADMINISTRATIVO }),
    (error: any) => error.statusCode === 400 && /exactamente|faltan|cobertura/i.test(error.message)
  );

  assert.equal(consultasAlumnos, 0, 'los errores estructurales deben ocurrir antes de resolver alumnos');
});

test('resuelve IDs públicos en lote y no hace consultas de alumno por fila', async () => {
  let consultasAlumnos = 0;
  let filasPersistidas: any[] = [];
  replaceMethod(cursadaRepository, 'findById', async () => currentCourse);
  replaceMethod(claseRepository, 'findCursada', async () => currentCourse);
  replaceMethod(claseRepository, 'findActiveEnrollments', async () => activeEnrollments);
  replaceMethod(alumnoRepository, 'findByUsuarioIds', async (ids: number[]) => {
    consultasAlumnos += 1;
    return ids.map(idCuenta => ({ idCuenta, idAlumno: idCuenta === 13 ? 6 : 7 }));
  });
  replaceMethod(claseRepository, 'saveAtomic', async (_input: any) => {
    filasPersistidas = _input.filas;
    return undefined;
  });

  const result = await claseService.saveClass(12, '2026-08-24', validPayload, {
    id: 1,
    rol: ROLES.ADMINISTRATIVO
  });

  assert.equal(consultasAlumnos, 1);
  assert.deepEqual(filasPersistidas.map(row => row.idAlumno), [6, 7]);
  assert.equal(result.temaDesarrollado, 'Ecuaciones lineales');
});

test('permite histórico en GET pero bloquea PUT docente fuera del ciclo', async () => {
  const historicalCourse = { ...currentCourse, anioLectivo: 2025 };
  replaceMethod(cursadaRepository, 'findById', async () => historicalCourse);
  replaceMethod(claseRepository, 'findCursada', async () => historicalCourse);
  replaceMethod(claseRepository, 'findHistory', async () => []);
  replaceMethod(claseRepository, 'findActiveEnrollments', async () => activeEnrollments);
  replaceMethod(alumnoRepository, 'findByUsuarioIds', async () => [
    { idCuenta: 13, idAlumno: 6 },
    { idCuenta: 14, idAlumno: 7 }
  ]);

  await assert.doesNotReject(
    claseService.listClasses(12, { id: 12, rol: ROLES.PROFESOR })
  );
  await assert.rejects(
    claseService.saveClass(12, '2025-08-24', validPayload, { id: 12, rol: ROLES.PROFESOR }),
    (error: any) => error.statusCode === 403
  );
});

test('devuelve historial y detalle sin exponer IDs internos', async () => {
  replaceMethod(cursadaRepository, 'findById', async () => currentCourse);
  replaceMethod(claseRepository, 'findCursada', async () => currentCourse);
  replaceMethod(claseRepository, 'findHistory', async () => [{
    fecha: '2026-08-24',
    temaDesarrollado: 'Ecuaciones',
    presentes: 1,
    ausentes: 1,
    ausentesJustificados: 1
  }]);
  replaceMethod(claseRepository, 'findDetail', async () => ({
    fecha: '2026-08-24',
    temaDesarrollado: 'Ecuaciones',
    asistencias: [{
      alumnoId: 13,
      nombre: 'Lucia Test',
      dni: 42666888,
      presente: true,
      justificado: false,
      observacion: null
    }]
  }));

  const history = await claseService.listClasses(12, { id: 12, rol: ROLES.PROFESOR });
  const detail = await claseService.getClass(12, '2026-08-24', { id: 12, rol: ROLES.PROFESOR });

  assert.deepEqual(history, [{
    fecha: '2026-08-24',
    temaDesarrollado: 'Ecuaciones',
    presentes: 1,
    ausentes: 1,
    ausentesJustificados: 1
  }]);
  assert.equal(detail.asistencias[0].alumnoId, 13);
  assert.equal('idAlumno' in detail.asistencias[0], false);
});

test('el historial rechaza libros duplicados de una misma fecha con conflicto', async () => {
  replaceMethod((prisma as any).libroDeTema, 'findMany', async () => [
    { fecha: new Date('2026-08-24T00:00:00.000Z'), temaDesarrollado: 'Ecuaciones A' },
    { fecha: new Date('2026-08-24T00:00:00.000Z'), temaDesarrollado: 'Ecuaciones B' }
  ]);
  replaceMethod((prisma as any).asistencia, 'findMany', async () => []);

  await assert.rejects(
    claseRepository.findHistory(12, 14, 2026),
    (error: any) => error.statusCode === 409 && /duplicados/i.test(error.message)
  );
});

test('la escritura atómica usa el mismo tx y propaga el fallo sin mutaciones posteriores', async () => {
  const tx = { $queryRaw: async () => [], libroDeTema: {}, asistencia: {} };
  const operaciones: string[] = [];
  const clientes: any[] = [];
  let rootWrites = 0;
  let callbackRechazada = false;
  replaceMethod((prisma as any), '$transaction', async (callback: any) => {
    try {
      return await callback(tx);
    } catch (error) {
      callbackRechazada = true;
      throw error;
    }
  });
  tx.$queryRaw = async (...args: any[]) => {
    clientes.push(tx);
    operaciones.push('materia.lock');
    assert.match(String(args[0]?.sql ?? args[0]), /SELECT id FROM materias/i);
    assert.match(String(args[0]?.sql ?? args[0]), /FOR UPDATE/i);
    return [];
  };
  tx.libroDeTema = {
    findMany: async () => {
      clientes.push(tx);
      operaciones.push('libro.findMany');
      return [];
    },
    create: async () => {
      clientes.push(tx);
      operaciones.push('libro.create');
      return { idLibroDeTema: 1 };
    },
    update: async () => {
      clientes.push(tx);
      operaciones.push('libro.update');
      return { idLibroDeTema: 1 };
    }
  };
  let upsertCalls = 0;
  tx.asistencia = {
    upsert: async () => {
      clientes.push(tx);
      upsertCalls += 1;
      operaciones.push(`asistencia.upsert.${upsertCalls}`);
      if (upsertCalls === 2) throw new Error('fallo de escritura');
      return { id: 1 };
    }
  };
  replaceMethod((prisma as any).libroDeTema, 'create', async () => { rootWrites += 1; });
  replaceMethod((prisma as any).libroDeTema, 'update', async () => { rootWrites += 1; });
  replaceMethod((prisma as any).asistencia, 'upsert', async () => { rootWrites += 1; });

  await assert.rejects(
    claseRepository.saveAtomic({
      cursadaId: 12,
      materiaId: 14,
      fecha: new Date('2026-08-24T00:00:00.000Z'),
      temaDesarrollado: 'Ecuaciones',
      filas: [
        { idAlumno: 6, presente: true, justificado: false, observacion: null },
        { idAlumno: 7, presente: true, justificado: false, observacion: null }
      ]
    })
  );

  assert.equal(callbackRechazada, true);
  assert.deepEqual(operaciones, [
    'materia.lock',
    'libro.findMany',
    'libro.create',
    'asistencia.upsert.1',
    'asistencia.upsert.2'
  ]);
  assert.equal(clientes.every(cliente => cliente === tx), true);
  assert.equal(rootWrites, 0);
  assert.equal(upsertCalls, 2);
});

test('dos escrituras reales del repository conservan la misma clave compuesta de upsert', async () => {
  const txs: any[] = [];
  const findManyResults = [[], [{ idLibroDeTema: 1 }]];
  const upserts: any[] = [];
  const libroWrites = { create: 0, update: 0 };
  replaceMethod((prisma as any), '$transaction', async (callback: any) => {
    const tx = {
      $queryRaw: async () => [],
      libroDeTema: {
        findMany: async () => findManyResults.shift(),
        create: async ({ data }: any) => {
          libroWrites.create += 1;
          return { idLibroDeTema: 1, ...data };
        },
        update: async ({ where, data }: any) => {
          libroWrites.update += 1;
          return { ...where, ...data };
        }
      },
      asistencia: {
        upsert: async (args: any) => {
          upserts.push({ tx, args });
          return { id: 1 };
        }
      }
    };
    txs.push(tx);
    return callback(tx);
  });

  const input = {
    cursadaId: 12,
    materiaId: 14,
    fecha: new Date('2026-08-24T00:00:00.000Z'),
    filas: [{ idAlumno: 6, presente: true, justificado: false, observacion: null }]
  };
  await claseRepository.saveAtomic({ ...input, temaDesarrollado: 'Inicial' });
  await claseRepository.saveAtomic({ ...input, temaDesarrollado: 'Corregido', filas: [
    { ...input.filas[0], presente: false, justificado: true }
  ] });

  assert.equal(upserts.length, 2);
  assert.deepEqual(libroWrites, { create: 1, update: 1 });
  assert.notEqual(txs[0], txs[1]);
  assert.deepEqual(
    upserts.map(call => call.args.where.cursadaId_alumnoId_fecha),
    [
      { cursadaId: 12, alumnoId: 6, fecha: input.fecha },
      { cursadaId: 12, alumnoId: 6, fecha: input.fecha }
    ]
  );
  assert.deepEqual(upserts[1].args.update, {
    presente: false,
    justificado: true,
    observacion: null
  });
});

test('el mapeo real del repository expone Usuario.idUsuario y no Alumno.idAlumno', async () => {
  replaceMethod((prisma as any).libroDeTema, 'findMany', async () => [{
    fecha: new Date('2026-08-24T00:00:00.000Z'),
    temaDesarrollado: 'Ecuaciones'
  }]);
  replaceMethod((prisma as any).asistencia, 'findMany', async () => [{
    presente: true,
    justificado: false,
    observacion: null,
    alumno: {
      idAlumno: 600,
      usuario: {
        idUsuario: 13,
        apellidoNombre: 'Lucia Test',
        dni: 42666888
      }
    }
  }]);

  const detail = await claseRepository.findDetail(
    12,
    14,
    new Date('2026-08-24T00:00:00.000Z')
  );

  assert.deepEqual(detail?.asistencias, [{
    alumnoId: 13,
    nombre: 'Lucia Test',
    dni: 42666888,
    presente: true,
    justificado: false,
    observacion: null
  }]);
  assert.equal('idAlumno' in detail!.asistencias[0], false);
});

test('PUT administrativo fuera del año lectivo no escribe', async () => {
  let writes = 0;
  replaceMethod(claseRepository, 'findCursada', async () => currentCourse);
  replaceMethod(claseRepository, 'saveAtomic', async () => {
    writes += 1;
  });

  await assert.rejects(
    claseService.saveClass(12, '2025-08-24', validPayload, {
      id: 1,
      rol: ROLES.ADMINISTRATIVO
    }),
    (error: any) => error.statusCode === 400 && /año lectivo/i.test(error.message)
  );
  assert.equal(writes, 0);
});

test('PUT y DELETE rechazan dos libros antes de cualquier mutación', async () => {
  const putCalls = { create: 0, update: 0, upsert: 0 };
  replaceMethod((prisma as any), '$transaction', async (callback: any) => callback({
    $queryRaw: async () => [],
    libroDeTema: {
      findMany: async () => [{ idLibroDeTema: 1 }, { idLibroDeTema: 2 }],
      create: async () => { putCalls.create += 1; },
      update: async () => { putCalls.update += 1; }
    },
    asistencia: {
      upsert: async () => { putCalls.upsert += 1; }
    }
  }));

  await assert.rejects(
    claseRepository.saveAtomic({
      cursadaId: 12,
      materiaId: 14,
      fecha: new Date('2026-08-24T00:00:00.000Z'),
      temaDesarrollado: 'No debe escribir',
      filas: [{ idAlumno: 6, presente: true, justificado: false, observacion: null }]
    }),
    (error: any) => error.statusCode === 409
  );
  assert.deepEqual(putCalls, { create: 0, update: 0, upsert: 0 });

  const deleteCalls = { deleteMany: 0, delete: 0 };
  replaceMethod((prisma as any), '$transaction', async (callback: any) => callback({
    libroDeTema: {
      findMany: async () => [{ idLibroDeTema: 1 }, { idLibroDeTema: 2 }],
      delete: async () => { deleteCalls.delete += 1; }
    },
    asistencia: {
      deleteMany: async () => { deleteCalls.deleteMany += 1; return { count: 0 }; }
    }
  }));

  await assert.rejects(
    claseRepository.deleteAtomic(
      12,
      14,
      new Date('2026-08-24T00:00:00.000Z')
    ),
    (error: any) => error.statusCode === 409
  );
  assert.deepEqual(deleteCalls, { deleteMany: 0, delete: 0 });
});

test('DELETE es exclusivamente administrativo', async () => {
  replaceMethod(cursadaRepository, 'findById', async () => currentCourse);
  replaceMethod(claseRepository, 'findCursada', async () => currentCourse);

  await assert.rejects(
    claseService.deleteClass(12, '2026-08-24', { id: 12, rol: ROLES.PROFESOR }),
    (error: any) => error.statusCode === 403
  );

});
