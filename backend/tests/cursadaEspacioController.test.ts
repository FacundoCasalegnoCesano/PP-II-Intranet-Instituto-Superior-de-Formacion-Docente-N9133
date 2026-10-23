import assert from 'node:assert/strict';
import { test } from 'node:test';
import cursadaEspacioController from '../src/controllers/cursadaEspacioController.js';
import cursadaEspacioService from '../src/services/cursadaEspacioService.js';
import { validationMiddleware } from '../src/middleware/validation.js';
import { cursadaEspacioIdParamsSchema, listarCursadasEspacioSchema } from '../src/validations/cursadaEspacioValidation.js';

test('el filtro activo convertido por Joi conserva true al consultar las cursadas', async () => {
  const originalList = cursadaEspacioService.list;
  let received: any;
  cursadaEspacioService.list = (async (filters: any) => {
    received = filters;
    return { data: [], total: 0, page: 1, limit: 20 };
  }) as any;

  try {
    const req: any = { query: { activo: 'true' }, user: { id: 1, rol: 'ADMINISTRATIVO' } };
    const res: any = { status() { return this; }, json() { return this; } };
    validationMiddleware(listarCursadasEspacioSchema, 'query')(req, res, () => undefined);
    await cursadaEspacioController.list(req, res, (error?: unknown) => { if (error) throw error; });
    assert.equal(received.activo, true);
  } finally {
    cursadaEspacioService.list = originalList;
  }
});

test('el ID de la oferta rechaza parámetros no enteros o no positivos antes de llegar a Prisma', () => {
  for (const id of ['abc', '0', '-2', '1.5']) {
    let nextCalled = false;
    let statusCode = 200;
    const req: any = { params: { id } };
    const res: any = {
      status(code: number) { statusCode = code; return this; },
      json() { return this; }
    };
    validationMiddleware(cursadaEspacioIdParamsSchema, 'params')(req, res, () => { nextCalled = true; });
    assert.equal(statusCode, 400);
    assert.equal(nextCalled, false);
  }
});
