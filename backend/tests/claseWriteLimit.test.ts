import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import YAML from 'yaml';

import { validationMiddleware } from '../src/middleware/validation.js';
import { claseWriteSchema } from '../src/validations/claseValidation.js';

const payloadWith = (count: number) => ({
  temaDesarrollado: 'Contenido de la clase',
  asistencias: Array.from({ length: count }, (_, index) => ({
    alumnoId: index + 1,
    presente: true,
    justificado: false
  }))
});

test('PUT de clase admite 500 asistencias y rechaza 501 antes del controller', async () => {
  assert.equal(claseWriteSchema.validate(payloadWith(500)).error, undefined);

  const req: any = { body: payloadWith(501) };
  let statusCode = 200;
  let responseBody: any;
  let nextCalls = 0;
  const res: any = {
    status(code: number) { statusCode = code; return this; },
    json(body: any) { responseBody = body; return this; }
  };

  validationMiddleware(claseWriteSchema)(req, res, () => { nextCalls += 1; });

  assert.equal(statusCode, 400);
  assert.equal(nextCalls, 0);
  assert.match(JSON.stringify(responseBody), /500/);
});

test('OpenAPI declara el mismo máximo del payload usado por PUT de clase', async () => {
  const source = await readFile(new URL('../openapi.yaml', import.meta.url), 'utf8');
  const specification = YAML.parse(source);
  assert.equal(specification.components.schemas.ClaseWritePayload.properties.asistencias.maxItems, 500);
});
