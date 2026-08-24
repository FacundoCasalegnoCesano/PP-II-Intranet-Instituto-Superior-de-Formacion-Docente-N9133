import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const routesDir = new URL('../src/routes/', import.meta.url);
const index = readFileSync(new URL('index.ts', routesDir), 'utf8');
const mounts = new Map<string, string>();
for (const match of index.matchAll(/router\.use\(['"]([^'"]+)['"],\s*(\w+)\)/g)) {
  mounts.set(match[2], match[1]);
}

function expressOperations(): string[] {
  const operations: string[] = [];
  for (const file of readdirSync(routesDir).filter(name => name.endsWith('Routes.ts'))) {
    const source = readFileSync(new URL(file, routesDir), 'utf8');
    const importMatch = index.match(new RegExp(`import\\s+(\\w+)\\s+from\\s+['"]\\./${file.replace('.ts', '.js')}['"]`));
    if (!importMatch) continue;
    const prefix = mounts.get(importMatch[1]) ?? '';
    for (const match of source.matchAll(/router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g)) {
      const path = `${prefix}${match[2] === '/' ? '' : match[2]}`
        .replace(/:([A-Za-z0-9_]+)/g, '{$1}') || '/';
      operations.push(`${match[1].toUpperCase()} ${path}`);
    }
  }
  for (const match of index.matchAll(/router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g)) {
    operations.push(`${match[1].toUpperCase()} ${match[2]}`);
  }
  return operations.sort();
}

function openApiOperations(): string[] {
  const yaml = readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8');
  const operations: string[] = [];
  let currentPath = '';
  for (const line of yaml.split(/\r?\n/)) {
    const path = line.match(/^  (\/[^:]*):\s*$/);
    if (path) currentPath = path[1];
    const method = line.match(/^    (get|post|put|patch|delete):\s*$/);
    if (currentPath && method) operations.push(`${method[1].toUpperCase()} ${currentPath}`);
    if (/^components:/.test(line)) break;
  }
  return operations.sort();
}

test('OpenAPI documenta todos los métodos y paths Express', () => {
  assert.deepEqual(openApiOperations(), expressOperations());
});
