import assert from 'node:assert/strict';
import { test } from 'node:test';
import config from '../src/config/env.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

test('producción nunca devuelve stack traces en errores internos', () => {
  const previous = config.nodeEnv;
  const logged: unknown[] = [];
  const previousConsoleError = console.error;
  config.nodeEnv = 'production';
  console.error = (...args: unknown[]) => logged.push(args);
  let response: any;
  const res = {
    status(code: number) { response = { status: code }; return this; },
    json(payload: unknown) { response.payload = payload; return this; }
  } as any;

  try {
    errorHandler(new Error('fallo interno con detalle'), { method: 'GET', path: '/api/private' } as any, res, (() => undefined) as any);
  } finally {
    config.nodeEnv = previous;
    console.error = previousConsoleError;
  }

  assert.equal(response.status, 500);
  assert.equal('stack' in response.payload, false);
  assert.equal(logged.length, 1);
});

test('el log de error conserva metadata útil y omite payloads con datos personales o secretos', () => {
  const previousConsoleError = console.error;
  const logged: unknown[][] = [];
  console.error = (...args: unknown[]) => logged.push(args);
  let response: any;
  const res = {
    status(code: number) { response = { status: code }; return this; },
    json(payload: unknown) { response.payload = payload; return this; }
  } as any;
  const req = {
    method: 'POST',
    path: '/api/users/42',
    baseUrl: '/api/users',
    route: { path: '/:id' },
    body: {
      email: 'persona@example.test',
      dni: '00000000',
      credentials: { password: 'clave-secreta', accessToken: 'token-secreto' }
    },
    query: { search: 'dato-privado' },
    params: { id: '42', authorization: 'Bearer secreto' },
    user: { id: 7 }
  } as any;

  try {
    const error = Object.assign(new Error('detalle con posible dato sensible'), { code: 'P2002' });
    errorHandler(error, req, res, (() => undefined) as any);
  } finally {
    console.error = previousConsoleError;
  }

  assert.deepEqual(logged, [[
    '❌ Error:',
    { name: 'Error', code: 'P2002', path: '/api/users/:id', method: 'POST', user: 7 }
  ]]);
  assert.equal(response.status, 400);
  assert.deepEqual(response.payload, {
    success: false,
    message: 'Ya existe un registro con ese valor único',
    field: 'campo único'
  });
});

test('un código no reconocido no se registra ni cambia la respuesta JWT', () => {
  const previousConsoleError = console.error;
  const logged: unknown[][] = [];
  console.error = (...args: unknown[]) => logged.push(args);
  let response: any;
  const res = {
    status(code: number) { response = { status: code }; return this; },
    json(payload: unknown) { response.payload = payload; return this; }
  } as any;

  try {
    const error = Object.assign(new Error('Token inválido: dato sensible'), {
      name: 'JsonWebTokenError',
      code: 'credential-secreto'
    });
    errorHandler(error, {
      method: 'POST', path: '/api/auth/login', body: { password: 'clave-secreta' }
    } as any, res, (() => undefined) as any);
  } finally {
    console.error = previousConsoleError;
  }

  assert.deepEqual(logged, [[
    '❌ Error:',
    { name: 'JsonWebTokenError', code: undefined, path: '/api/auth/login', method: 'POST', user: undefined }
  ]]);
  assert.equal(response.status, 401);
  assert.deepEqual(response.payload, { success: false, message: 'Token inválido' });
});
