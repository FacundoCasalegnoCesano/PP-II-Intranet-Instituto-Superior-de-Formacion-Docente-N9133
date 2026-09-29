import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { prisma } from '../src/config/prisma.js';
import userRepository from '../src/repositories/userRepository.js';
import userService from '../src/services/userService.js';
import inscripcionCarreraRepository from '../src/repositories/inscripcionCarreraRepository.js';
import inscripcionCarreraService from '../src/services/inscripcionCarreraService.js';
import { ROLES } from '../src/constants/roles.js';
import { listAlumnosSchema } from '../src/validations/userValidation.js';

const restorations: Array<() => void> = [];

function replaceMethod(target: any, key: string, replacement: unknown) {
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

test('la consulta administrativa combina rol, búsqueda y carrera con AND', async () => {
  let findArgs: any;
  let countArgs: any;
  replaceMethod(prisma.usuario, 'findMany', async (args: any) => {
    findArgs = args;
    return [{
      idUsuario: 13,
      apellidoNombre: 'Lucia Test Fernandez',
      dni: 42666888,
      email: 'lucia@example.com',
      activo: false,
      rol: 'ALUMNO,PROFESOR',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01')
    }];
  });
  replaceMethod(prisma.usuario, 'count', async (args: any) => {
    countArgs = args;
    return 1;
  });

  const result = await userRepository.findAlumnosForAdministrativo({
    page: 2,
    limit: 10,
    search: 'Lucia',
    carreraId: 3
  });

  assert.deepEqual(findArgs.where, {
    AND: [
      { rol: { contains: ROLES.ALUMNO } },
      { OR: [
        { apellidoNombre: { contains: 'Lucia' } },
        { email: { contains: 'Lucia' } }
      ] },
      { inscripcionesCarrera: { some: { carreraId: 3 } } }
    ]
  });
  assert.deepEqual(countArgs.where, findArgs.where);
  assert.deepEqual(findArgs.orderBy, [{ apellidoNombre: 'asc' }, { idUsuario: 'asc' }]);
  assert.equal(result.data[0].roles[0], ROLES.ALUMNO);
  assert.equal(result.pagination.total, 1);
  assert.equal(result.pagination.page, 2);
});

test('la búsqueda numérica de alumnos usa DNI exacto y conserva cuentas inactivas sin filtro activo', async () => {
  let findArgs: any;
  replaceMethod(prisma.usuario, 'findMany', async (args: any) => {
    findArgs = args;
    return [];
  });
  replaceMethod(prisma.usuario, 'count', async () => 0);

  await userRepository.findAlumnosForAdministrativo({ search: '42666888' });

  assert.deepEqual(findArgs.where, {
    AND: [
      { rol: { contains: ROLES.ALUMNO } },
      { OR: [
        { apellidoNombre: { contains: '42666888' } },
        { email: { contains: '42666888' } },
        { dni: { equals: 42666888 } }
      ] }
    ]
  });
  assert.equal('activo' in findArgs.where, false);
});

test('el service administrativo mantiene el filtro de carrera dedicado', async () => {
  let received: unknown;
  replaceMethod(userRepository, 'findAlumnosForAdministrativo', async (filters: unknown) => {
    received = filters;
    return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } };
  });

  await userService.listAlumnosForAdministrativo({ page: 1, limit: 20, carreraId: 3 });
  assert.deepEqual(received, { page: 1, limit: 20, carreraId: 3 });
});

test('el schema de alumnos acepta carreraId positivo y rechaza valores no positivos', () => {
  const valid = listAlumnosSchema.validate({ carreraId: '3' });
  assert.equal(valid.error, undefined);
  assert.equal(valid.value.carreraId, 3);

  const invalid = listAlumnosSchema.validate({ carreraId: 0 });
  assert.ok(invalid.error);
});

test('includeInactive solo amplía el historial para administrativos', async () => {
  let includeInactive: unknown;
  replaceMethod(inscripcionCarreraRepository, 'getCarrerasInscriptas', async (_id: number, include: boolean) => {
    includeInactive = include;
    return [];
  });

  await inscripcionCarreraService.getInscripcionesByAlumno(
    13,
    { id: 1, rol: ROLES.ADMINISTRATIVO },
    { includeInactive: true }
  );
  assert.equal(includeInactive, true);

  await assert.rejects(
    inscripcionCarreraService.getInscripcionesByAlumno(
      13,
      { id: 13, rol: ROLES.ALUMNO },
      { includeInactive: true }
    ),
    (error: any) => error.statusCode === 403
  );
  assert.equal(includeInactive, true);
});

test('el repositorio mantiene activo=true por defecto y omite ese filtro para el historial administrativo', async () => {
  const wheres: any[] = [];
  replaceMethod(prisma.inscripcionCarrera, 'findMany', async ({ where }: any) => {
    wheres.push(where);
    return [];
  });

  await inscripcionCarreraRepository.getCarrerasInscriptas(13);
  await inscripcionCarreraRepository.getCarrerasInscriptas(13, true);

  assert.deepEqual(wheres, [
    { usuarioId: 13, activo: true },
    { usuarioId: 13 }
  ]);
});
