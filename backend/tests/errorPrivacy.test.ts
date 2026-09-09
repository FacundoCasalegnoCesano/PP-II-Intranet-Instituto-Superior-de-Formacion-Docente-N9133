import assert from 'node:assert/strict';
import { test } from 'node:test';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { sanitizeRequestPath } from '../src/utils/requestPrivacy.js';

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
