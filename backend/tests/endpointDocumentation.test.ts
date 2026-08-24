import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

type DocumentationRow = {
  metodo: string;
  endpoint: string;
  codigo: number | string;
  respuesta?: unknown;
};

const rows = JSON.parse(
  readFileSync(new URL('../test-results/endpoints-happy-path.json', import.meta.url), 'utf8')
) as DocumentationRow[];

test('cada GET ejecutado incluye un ejemplo de respuesta', () => {
  const missing = rows.filter(row => row.metodo === 'GET'
    && typeof row.codigo === 'number'
    && row.codigo < 400
    && row.respuesta == null);

  assert.deepEqual(missing.map(row => row.endpoint), []);
});

test('cada DELETE exitoso conserva el mensaje específico del endpoint', () => {
  const invalid = rows.filter(row => row.metodo === 'DELETE'
    && typeof row.codigo === 'number'
    && row.codigo < 400
    && (typeof row.respuesta !== 'string' || row.respuesta.trim() === ''));

  assert.deepEqual(invalid.map(row => row.endpoint), []);

  const messages = new Set(rows
    .filter(row => row.metodo === 'DELETE' && typeof row.respuesta === 'string')
    .map(row => row.respuesta));
  assert.ok(messages.size > 1, 'los mensajes DELETE no deben normalizarse a un único texto');
});
