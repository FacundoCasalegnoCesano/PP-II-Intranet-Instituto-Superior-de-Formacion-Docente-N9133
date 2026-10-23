import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import inscripcionCarreraController from '../src/controllers/inscripcionCarreraController.js';
import inscripcionCarreraRepository from '../src/repositories/inscripcionCarreraRepository.js';
import inscripcionCarreraService from '../src/services/inscripcionCarreraService.js';
import userRepository from '../src/repositories/userRepository.js';
import carreraRepository from '../src/repositories/carreraRepository.js';
import { ROLES } from '../src/constants/roles.js';
import { prisma } from '../src/config/prisma.js';
import { AppError } from '../src/utils/AppError.js';
import { inscripcionCarreraSchema } from '../src/validations/inscripcionCarreraValidation.js';

const restorations: Array<() => void> = [];

function replaceMethod(target: any, key: string, replacement: any) {
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

function configureValidEnrollment() {
  replaceMethod(userRepository, 'findById', async () => ({
    idUsuario: 8,
    rol: ROLES.ALUMNO
  }));
  replaceMethod(carreraRepository, 'findById', async () => ({
    id: 3,
    nombre: 'Profesorado de Prueba',
    activo: true
  }));
}

test('el esquema deja la decisión de cohorte al service según exista una inscripción previa', () => {
  const result = inscripcionCarreraSchema.validate({ alumnoId: 8, carreraId: 3, cicloLectivo: 2027 });
  assert.equal(result.error, undefined);
  assert.equal(inscripcionCarreraSchema.validate({ alumnoId: 8, carreraId: 3, anioCohorte: 2027 }).error, undefined);
});

test('exige cohorte si se trata de una inscripción nueva', async () => {
  configureValidEnrollment();
  replaceMethod(inscripcionCarreraRepository, 'findByUsuarioAndCarreraIncludingBaja', async () => null);
  let called = false;
  replaceMethod(inscripcionCarreraRepository, 'inscribirAtomic', async () => { called = true; return {}; });

  await assert.rejects(
    inscripcionCarreraService.inscribirAlumno(
      { usuarioId: 8, carreraId: 3, cicloLectivo: 2027 },
      { id: 1, rol: ROLES.ADMINISTRATIVO }
    ),
    (error: any) => error.statusCode === 400 && /requerido para una inscripción nueva/i.test(error.message)
  );
  assert.equal(called, false);
});

test('reactiva sin cohorte en la solicitud y conserva la cohorte existente', async () => {
  configureValidEnrollment();
  const previa = {
    id: 41,
    usuarioId: 8,
    carreraId: 3,
    activo: false,
    fechaBaja: new Date('2026-05-01'),
    fechaInscripcion: new Date('2026-03-01'),
    anioCohorte: 2022
  };
  let receivedData: unknown;
  let created = false;
  replaceMethod(inscripcionCarreraRepository, 'inscribirAtomic', async (data: unknown) => {
    receivedData = data;
    return { ...previa, activo: true, fechaBaja: null, fechaInscripcion: new Date(), cicloLectivo: (data as any).cicloLectivo };
  });
  replaceMethod(inscripcionCarreraRepository, 'findByUsuarioAndCarreraIncludingBaja', async () => previa);
  replaceMethod(inscripcionCarreraRepository, 'create', async () => {
    created = true;
    return {};
  });

  const before = new Date();
  const result = await inscripcionCarreraService.inscribirAlumno(
    { usuarioId: 8, carreraId: 3, cicloLectivo: 2027 },
    { id: 1, rol: ROLES.ADMINISTRATIVO }
  );
  const after = new Date();

  assert.equal(result.id, previa.id);
  assert.equal(created, false);
  assert.equal((receivedData as any).usuarioId, 8);
  assert.equal((receivedData as any).carreraId, 3);
  assert.equal((receivedData as any).cicloLectivo, 2027);
  assert.equal('anioCohorte' in (receivedData as any), false);
  assert.equal(result.cicloLectivo, 2027);
  assert.equal(result.anioCohorte, 2022);
  assert.ok(result.fechaInscripcion >= before);
  assert.ok(result.fechaInscripcion <= after);
});

test('reactivar una inscripción legacy sin cohorte conserva null', async () => {
  configureValidEnrollment();
  const previa = { id: 42, usuarioId: 8, carreraId: 3, activo: false, anioCohorte: null };
  replaceMethod(inscripcionCarreraRepository, 'findByUsuarioAndCarreraIncludingBaja', async () => previa);
  replaceMethod(inscripcionCarreraRepository, 'inscribirAtomic', async () => ({ ...previa, activo: true, reactivada: true }));

  const result = await inscripcionCarreraService.inscribirAlumno(
    { usuarioId: 8, carreraId: 3, cicloLectivo: 2027 },
    { id: 1, rol: ROLES.ADMINISTRATIVO }
  );
  assert.equal(result.anioCohorte, null);
});

test('mantiene el rechazo específico cuando la inscripción activa ya existe', async () => {
  configureValidEnrollment();
  replaceMethod(inscripcionCarreraRepository, 'findByUsuarioAndCarreraIncludingBaja', async () => ({ activo: true, anioCohorte: null }));
  replaceMethod(inscripcionCarreraRepository, 'inscribirAtomic', async () => {
    throw new AppError(400, 'El alumno ya está inscripto en esta carrera');
  });

  await assert.rejects(
    inscripcionCarreraService.inscribirAlumno(
      { usuarioId: 8, carreraId: 3, cicloLectivo: 2026, anioCohorte: 2026 },
      { id: 1, rol: ROLES.ADMINISTRATIVO }
    ),
    (error: any) => error.statusCode === 400 && error.message === 'El alumno ya está inscripto en esta carrera'
  );
});

test('informa al frontend que la inscripción fue reactivada', async () => {
  const original = inscripcionCarreraService.inscribirAlumno;
  inscripcionCarreraService.inscribirAlumno = async () => ({ id: 41, reactivada: true }) as any;
  restorations.push(() => { inscripcionCarreraService.inscribirAlumno = original; });

  const response = {
    statusCode: 0,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; }
  };
  await inscripcionCarreraController.inscribirAlumno(
    { body: { alumnoId: 8, carreraId: 3, cicloLectivo: 2026, anioCohorte: 2026 }, user: { id: 1, rol: ROLES.ADMINISTRATIVO } } as any,
    response as any,
    (error: unknown) => { throw error; }
  );

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.message, 'Inscripción a la carrera reactivada exitosamente');
});

test('rechaza una cuenta de alumno inactiva aunque invoque el service directamente', async () => {
  configureValidEnrollment();
  replaceMethod(userRepository, 'findById', async () => ({ idUsuario: 8, rol: ROLES.ALUMNO, activo: false }));
  let atomicCalled = false;
  replaceMethod(inscripcionCarreraRepository, 'inscribirAtomic', async () => {
    atomicCalled = true;
    return {};
  });

  await assert.rejects(
    inscripcionCarreraService.inscribirAlumno(
      { usuarioId: 8, carreraId: 3, cicloLectivo: 2026, anioCohorte: 2026 },
      { id: 1, rol: ROLES.ADMINISTRATIVO }
    ),
    (error: any) => error.statusCode === 400 && error.message === 'El alumno está inactivo'
  );
  assert.equal(atomicCalled, false);
});

function installFakeAtomicTransaction(rows: any[]) {
  let locked = false;
  const waiters: Array<() => void> = [];
  const acquire = async () => {
    if (locked) await new Promise<void>((resolve) => waiters.push(resolve));
    locked = true;
  };
  const release = () => {
    locked = false;
    waiters.shift()?.();
  };

  replaceMethod(prisma, '$transaction', async (callback: (tx: any) => Promise<unknown>) => {
    let ownsLock = false;
    const tx = {
      $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        assert.equal(strings[0].replace(/\s+/g, ' ').trim(), 'SELECT idUsuario FROM Usuario WHERE idUsuario =');
        assert.equal(strings[1].replace(/\s+/g, ' ').trim(), 'FOR UPDATE');
        assert.equal(values[0], 8);
        await acquire();
        ownsLock = true;
        return [{ idUsuario: 8 }];
      },
      inscripcionCarrera: {
        findFirst: async ({ where }: any) => rows.find((row) => row.usuarioId === where.usuarioId && row.carreraId === where.carreraId && (where.activo === undefined || row.activo === where.activo)) ?? null,
        count: async ({ where }: any) => rows.filter((row) => row.usuarioId === where.usuarioId && row.activo === where.activo).length,
        create: async ({ data }: any) => {
          const row = { id: rows.length + 1, ...data };
          rows.push(row);
          return row;
        },
        update: async ({ where, data }: any) => {
          const row = rows.find((candidate) => candidate.id === where.id);
          Object.assign(row, data);
          return row;
        }
      }
    };
    try {
      return await callback(tx);
    } finally {
      if (ownsLock) release();
    }
  });
}

test('serializa por alumno el límite máximo ante dos altas concurrentes', async () => {
  const rows = [{ id: 1, usuarioId: 8, carreraId: 1, activo: true }];
  installFakeAtomicTransaction(rows);

  const results = await Promise.allSettled([
    inscripcionCarreraRepository.inscribirAtomic({ usuarioId: 8, carreraId: 2, cicloLectivo: 2026, anioCohorte: 2026 }),
    inscripcionCarreraRepository.inscribirAtomic({ usuarioId: 8, carreraId: 3, cicloLectivo: 2026, anioCohorte: 2026 })
  ]);

  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.equal((results.find((result) => result.status === 'rejected') as PromiseRejectedResult).reason.message, 'El alumno ya está inscripto en 2 carreras (máximo permitido)');
  assert.equal(rows.filter((row) => row.activo).length, 2);
});

test('serializa por alumno la reactivación para que una misma fila no gane dos veces', async () => {
  const rows = [{ id: 41, usuarioId: 8, carreraId: 3, activo: false, fechaBaja: new Date('2026-05-01'), cicloLectivo: 2023, anioCohorte: 2021 }];
  installFakeAtomicTransaction(rows);

  const results = await Promise.allSettled([
    inscripcionCarreraRepository.inscribirAtomic({ usuarioId: 8, carreraId: 3, cicloLectivo: 2026, anioCohorte: 2026 }),
    inscripcionCarreraRepository.inscribirAtomic({ usuarioId: 8, carreraId: 3, cicloLectivo: 2026, anioCohorte: 2026 })
  ]);

  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.equal((results.find((result) => result.status === 'rejected') as PromiseRejectedResult).reason.message, 'El alumno ya está inscripto en esta carrera');
  assert.equal(rows.filter((row) => row.activo).length, 1);
  assert.equal(rows[0].cicloLectivo, 2023);
  assert.equal(rows[0].anioCohorte, 2026);
});

test('una inscripción nueva válida persiste el año de cohorte', async () => {
  const rows: any[] = [];
  installFakeAtomicTransaction(rows);

  const result = await inscripcionCarreraRepository.inscribirAtomic({
    usuarioId: 8,
    carreraId: 3,
    cicloLectivo: 2027,
    anioCohorte: 2024
  });

  assert.equal(result.anioCohorte, 2024);
  assert.equal(rows[0].anioCohorte, 2024);
});

test('una inscripción nueva omite ciclo lectivo y persiste null sin copiar la cohorte', async () => {
  const rows: any[] = [];
  installFakeAtomicTransaction(rows);
  const result = await inscripcionCarreraRepository.inscribirAtomic({ usuarioId: 8, carreraId: 3, anioCohorte: 2026 });
  assert.equal(result.cicloLectivo, null);
  assert.equal(result.anioCohorte, 2026);
});

test('la transacción también rechaza una alta nueva sin cohorte', async () => {
  const rows: any[] = [];
  installFakeAtomicTransaction(rows);

  await assert.rejects(
    inscripcionCarreraRepository.inscribirAtomic({ usuarioId: 8, carreraId: 3, cicloLectivo: 2027 }),
    (error: any) => error.statusCode === 400 && /requerido para una inscripción nueva/i.test(error.message)
  );
  assert.equal(rows.length, 0);
});
