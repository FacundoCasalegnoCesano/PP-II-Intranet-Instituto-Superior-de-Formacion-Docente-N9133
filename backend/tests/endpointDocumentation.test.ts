import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from 'yaml';

const document = parse(readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8')) as {
  paths: Record<string, Record<string, { responses?: Record<string, unknown> }>>;
};

test('OpenAPI declara respuestas exitosas para todas las lecturas y bajas', () => {
  const missing: string[] = [];
  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const method of ['get', 'delete']) {
      const operation = pathItem[method];
      if (!operation) continue;
      const success = Object.entries(operation.responses ?? {}).filter(([status]) => /^2\d\d$/.test(status));
      if (success.length === 0 || success.some(([, response]) => {
        if (!response || typeof response !== 'object') return true;
        const fields = response as Record<string, unknown>;
        return !fields.$ref && typeof fields.description !== 'string' && !fields.content;
      })) {
        missing.push(`${method.toUpperCase()} ${path}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});
