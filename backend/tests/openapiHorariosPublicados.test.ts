import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('OpenAPI documenta los seis contratos de horarios publicados', () => {
  const openapi = readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8');

  for (const ruta of [
    '/horarios-publicados/anios:',
    '/horarios-publicados/actual:',
    '/horarios-publicados/{id}/archivo:',
    '/horarios-publicados:',
    '/horarios-publicados/historial:',
    '/horarios-publicados/{id}/publicar:'
  ]) {
    assert.match(openapi, new RegExp(ruta.replace(/[{}]/g, '\\$&')));
  }
  assert.match(openapi, /multipart\/form-data/);
  assert.match(openapi, /application\/pdf/);
  assert.match(openapi, /ADMINISTRATIVO/);
});
