import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import homologacionController from '../src/controllers/homologacionController.js';
import homologacionService from '../src/services/homologacionService.js';

const originalResolver = homologacionService.resolver;

afterEach(() => {
  homologacionService.resolver = originalResolver;
});

test('informa Solicitud aprobada al aprobar una homologación', async () => {
  homologacionService.resolver = async () => ({ id: 7, estado: 'APROBADA' }) as any;

  let body: any;
  const req = { params: { id: '7' }, body: { accion: 'APROBAR' } } as any;
  const res = {
    json(payload: any) {
      body = payload;
      return this;
    }
  } as any;

  await homologacionController.resolver(req, res, (error: unknown) => {
    throw error;
  });

  assert.equal(body.message, 'Solicitud aprobada');
});

test('informa Solicitud rechazada al rechazar una homologación', async () => {
  homologacionService.resolver = async () => ({ id: 7, estado: 'RECHAZADA' }) as any;

  let body: any;
  const req = { params: { id: '7' }, body: { accion: 'RECHAZAR' } } as any;
  const res = {
    json(payload: any) {
      body = payload;
      return this;
    }
  } as any;

  await homologacionController.resolver(req, res, (error: unknown) => {
    throw error;
  });

  assert.equal(body.message, 'Solicitud rechazada');
});
