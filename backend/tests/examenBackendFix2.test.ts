import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import examenRepository from '../src/repositories/examenRepository.js';
import examenService from '../src/services/examenService.js';
import { ROLES } from '../src/constants/roles.js';

const restorations: Array<() => void> = [];

function replaceMethod(target: any, key: string, replacement: any) {
  const original = target[key];
  target[key] = replacement;
  restorations.push(() => { target[key] = original; });
}

afterEach(() => {
  while (restorations.length > 0) restorations.pop()?.();
});

const mesa = {
  id: 9,
  materia: { id: 7, nombre: 'Didáctica', carrera: { id: 2, nombre: 'Inicial' } },
  fecha: new Date('2026-09-01T12:00:00.000Z'),
  tipoExamen: 'ORAL',
  llamado: 1,
  estadoMesa: 'ABIERTA',
  version: 3,
  publicadaEn: null,
  tribunales: [],
  _count: { inscripciones: 0 }
};

test('el administrativo conserva los filtros recibidos al listar mesas', async () => {
  const filters = {
    page: 3,
    limit: 10,
    materiaId: 7,
    carreraId: 2,
    estadoMesa: 'ABIERTA'
  };
  let receivedFilters: unknown;
  replaceMethod(examenRepository, 'findAllExamenes', async (received: unknown) => {
    receivedFilters = received;
    return { data: [mesa], pagination: { page: 3, limit: 10, total: 1, totalPages: 1 } };
  });

  const result = await examenService.listExamenes(filters, {
    id: 1,
    rol: ROLES.ADMINISTRATIVO
  });

  assert.deepEqual(receivedFilters, filters);
  assert.equal(result.data[0].id, 9);
});

test('el profesor autorizado lista mesas y el profesorId del request no puede sobrescribir su identidad', async () => {
  const filters = { page: 2, limit: 5, materiaId: 7, profesorId: 999 };
  let receivedFilters: any;
  replaceMethod(examenRepository, 'findAllExamenes', async (received: any) => {
    receivedFilters = received;
    return { data: [mesa], pagination: { page: 2, limit: 5, total: 1, totalPages: 1 } };
  });

  const result = await examenService.listExamenes(filters, {
    id: 20,
    rol: ROLES.PROFESOR
  });

  assert.equal(receivedFilters.profesorId, 20);
  assert.equal(receivedFilters.page, 2);
  assert.equal(receivedFilters.limit, 5);
  assert.equal(result.data[0].id, 9);
});

test('un rol no permitido recibe 403 sin consultar el repositorio', async () => {
  let repositoryCalled = false;
  replaceMethod(examenRepository, 'findAllExamenes', async () => {
    repositoryCalled = true;
    return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } };
  });

  await assert.rejects(
    examenService.listExamenes({}, { id: 13, rol: ROLES.ALUMNO }),
    (error: any) => error.statusCode === 403 && /listar mesas/i.test(error.message)
  );
  assert.equal(repositoryCalled, false);
});
