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
