import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from 'yaml';
import { validationMiddleware } from '../src/middleware/validation.js';
import { cargaCalificacionesSchema } from '../src/validations/calificacionValidation.js';

const lote = (cantidad: number) => ({
  cursadaId: 1,
  calificaciones: Array.from({ length: cantidad }, (_, index) => ({
    alumnoId: index + 1,
    tipoCalificacion: 'TRABAJO_PRACTICO',
    nota: 8
  }))
});

test('admite 500 calificaciones y bloquea 501 antes de llamar al controller', () => {
  assert.equal(cargaCalificacionesSchema.validate(lote(500)).error, undefined);

  let nextCalls = 0;
  let statusCode = 0;
  let body: any;
  const req: any = { body: lote(501) };
  const res: any = {
    status(code: number) { statusCode = code; return this; },
    json(value: unknown) { body = value; return this; }
  };

  validationMiddleware(cargaCalificacionesSchema)(req, res, () => { nextCalls += 1; });

  assert.equal(statusCode, 400);
  assert.equal(body.errors[0].field, 'calificaciones');
  assert.match(body.errors[0].message, /500/);
  assert.equal(nextCalls, 0);
});

test('OpenAPI limita el lote de calificaciones al mismo máximo', () => {
  const document = parse(readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8')) as any;
  assert.equal(document.components.schemas.CargaCalificacionesRequest.properties.calificaciones.maxItems, 500);
});
