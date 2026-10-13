import assert from 'node:assert/strict';
import { test } from 'node:test';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { sanitizeRequestPath } from '../src/utils/requestPrivacy.js';
import { AppError } from '../src/utils/AppError.js';

function invokeErrorHandler(error: unknown) {
  let statusCode = 0;
  let payload: unknown;
  const request: any = { path: '/api/test', method: 'GET', body: {}, query: {}, params: {} };
  const response: any = {
    status: (status: number) => { statusCode = status; return response; },
    json: (body: unknown) => { payload = body; return response; }
  };
  errorHandler(error, request, response, () => undefined);
  return { statusCode, payload };
}

test('el manejador de errores no registra tokens de recuperación en path ni params', () => {
  const logs: unknown[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => logs.push(args);

  try {
    const request: any = {
      path: '/api/auth/verify-reset-token/token-super-secreto',
      route: undefined,
      baseUrl: '/api/auth',
      method: 'GET',
      body: {},
      query: {},
      params: { token: 'token-super-secreto' },
      user: undefined
    };
    const response: any = {
      status: () => response,
      json: () => response
    };

    errorHandler(new Error('Token inválido'), request, response, () => undefined);

    const serialized = JSON.stringify(logs);
    assert.doesNotMatch(serialized, /token-super-secreto/);
    assert.match(serialized, /REDACTED/);
  } finally {
    console.error = originalError;
  }
});

test('los logs de acceso y respuestas 404 pueden reutilizar el path sanitizado', () => {
  assert.equal(
    sanitizeRequestPath('/api/auth/verify-reset-token/token-super-secreto'),
    '/api/auth/verify-reset-token/[REDACTED]'
  );
});

test('los errores inesperados responden de forma genérica sin filtrar mensaje ni stack', () => {
  const logs: unknown[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => logs.push(args);
  try {
    const result = invokeErrorHandler(new Error('secreto-interno'));
    assert.equal(result.statusCode, 500);
    assert.deepEqual(result.payload, { success: false, message: 'Error interno del servidor' });
    assert.doesNotMatch(JSON.stringify(result.payload), /secreto-interno/);
    assert.doesNotMatch(JSON.stringify(logs), /secreto-interno/);
  } finally {
    console.error = originalError;
  }
});

test('AppError conserva el estado y mensaje controlados, también para status 500', () => {
  assert.deepEqual(invokeErrorHandler(new AppError(500, 'El archivo publicado no está disponible')), {
    statusCode: 500,
    payload: { success: false, message: 'El archivo publicado no está disponible' }
  });
});
