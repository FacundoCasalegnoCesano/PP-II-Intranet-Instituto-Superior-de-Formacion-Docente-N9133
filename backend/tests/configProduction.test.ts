import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('sin NODE_ENV, usa production y no devuelve el stack al responder un error', () => {
  const source = `
    import config from './src/config/env.ts';
    import { errorHandler } from './src/middleware/errorHandler.ts';
    let response;
    const res = {
      status(code) { response = { status: code }; return this; },
      json(payload) { response.payload = payload; return this; },
    };
    errorHandler(new Error('detalle interno'), { method: 'GET', path: '/api/private' }, res, () => {});
    process.stdout.write(JSON.stringify({ nodeEnv: config.nodeEnv, response }));
  `;
  const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', source], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: '', JWT_SECRET: 'test-only-secret' },
  });

  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout) as { nodeEnv: string; response: { status: number; payload: Record<string, unknown> } };
  assert.equal(result.nodeEnv, 'production');
  assert.equal(result.response.status, 500);
  assert.equal('stack' in result.response.payload, false);
});
