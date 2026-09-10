import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('OpenAPI documenta los seis contratos de horarios publicados', () => {
  const openapi = readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n');

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
  const inicioPublicacion = openapi.indexOf('  /horarios-publicados:\n');
  const finPublicacion = openapi.indexOf('  /horarios-publicados/historial:', inicioPublicacion);
  const publicar = openapi.slice(inicioPublicacion, finPublicacion);
  assert.match(publicar, /titulo: \{ type: string, maxLength: 160 \}/i);
  assert.match(publicar, /'200':\s*\n\s+description: Se reutilizó y restauró como vigente un PDF idéntico/);
  assert.match(publicar, /'201':\s*\n\s+description: PDF nuevo publicado inmediatamente/);
});
