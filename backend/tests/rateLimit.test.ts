import assert from 'node:assert/strict';
import { test } from 'node:test';

test('NODE_ENV=test no limita una batería de más de 100 solicitudes', async () => {
  process.env.NODE_ENV = 'test';
  const { app } = await import('../src/app.js');
  const server = app.listen(0);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');

  try {
    for (let index = 0; index < 105; index += 1) {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
      assert.equal(response.status, 200, `solicitud ${index + 1}`);
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
