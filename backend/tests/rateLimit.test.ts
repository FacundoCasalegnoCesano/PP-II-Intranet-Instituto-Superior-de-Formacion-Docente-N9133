import assert from 'node:assert/strict';
import { test } from 'node:test';

test('la API autenticada no tiene un limite global por IP', async () => {
  process.env.NODE_ENV = 'production';
  const { app } = await import('../src/app.js');
  const server = app.listen(0);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');

  try {
    for (let index = 0; index < 205; index += 1) {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
      assert.equal(response.status, 200, `solicitud ${index + 1}`);
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('recuperacion de contrasena tiene un limite especifico de 5 solicitudes', async () => {
  process.env.NODE_ENV = 'production';
  const { app } = await import('../src/app.js');
  const server = app.listen(0);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');

  try {
    for (let index = 0; index < 5; index += 1) {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}'
      });
      assert.equal(response.status, 400);
    }

    const limitada = await fetch(`http://127.0.0.1:${address.port}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    });
    assert.equal(limitada.status, 429);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
