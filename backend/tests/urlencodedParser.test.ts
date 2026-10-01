import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { test } from 'node:test';

test('el parser extendido de Express conserva campos anidados del formulario', async () => {
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.post('/parse', (req, res) => res.json(req.body));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'asistencias%5B0%5D%5BalumnoId%5D=12&asistencias%5B0%5D%5Bestado%5D=PRESENTE',
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { asistencias: [{ alumnoId: '12', estado: 'PRESENTE' }] });
  } finally {
    server.close();
    await once(server, 'close');
  }
});
