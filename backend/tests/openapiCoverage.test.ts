import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const routesDir = new URL('../src/routes/', import.meta.url);
const index = readFileSync(new URL('index.ts', routesDir), 'utf8');
const openApi = readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8');
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
  const yaml = openApi;
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

function pathBlock(path: string): string {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return openApi.match(new RegExp(`  ${escaped}:\\r?\\n[\\s\\S]*?(?=\\r?\\n  /|\\r?\\ncomponents:)`))?.[0] ?? '';
}

test('OpenAPI documenta todos los métodos y paths Express', () => {
  assert.deepEqual(openApiOperations(), expressOperations());
});

test('OpenAPI documenta el detalle y los contratos administrativos de homologaciones', () => {
  const detailBlock = openApi.match(/  \/homologaciones\/\{id\}:\r?\n    get:[\s\S]*?(?=\r?\n  \/homologaciones\/\{id\}\/nota-complementaria:)/)?.[0] ?? '';
  assert.match(detailBlock, /get:/);
  assert.match(detailBlock, /x-roles: \[ADMINISTRATIVO\]/);
  assert.match(detailBlock, /HomologacionOK/);

  const listBlock = openApi.match(/  \/homologaciones:\r?\n    get:[\s\S]*?(?=\r?\n  \/homologaciones\/\{id\}:)/)?.[0] ?? '';
  for (const parameter of ['search', 'estado', 'tipo', 'carreraId', 'materiaId']) {
    assert.match(listBlock, new RegExp(`name: ${parameter}\\b`));
  }
  assert.match(listBlock, /components\/parameters\/Page/);
  assert.match(listBlock, /components\/parameters\/Limit/);
  assert.match(listBlock, /x-roles: \[ADMINISTRATIVO\]/);

  assert.match(openApi, /HomologacionRequest:[\s\S]*oneOf:/);
  const totalRequest = openApi.match(/HomologacionTotalRequest:[\s\S]*?(?=\r?\n    HomologacionParcialRequest:)/)?.[0] ?? '';
  const partialRequest = openApi.match(/HomologacionParcialRequest:[\s\S]*?(?=\r?\n    NotaComplementariaRequest:)/)?.[0] ?? '';
  assert.match(totalRequest, /required: \[alumnoId, materiaId, tipoHomologacion, calificacion\]/);
  assert.match(totalRequest, /calificacion: \{ type: integer, minimum: 0, maximum: 10 \}/);
  assert.match(partialRequest, /required: \[alumnoId, materiaId, tipoHomologacion\]/);
  assert.doesNotMatch(partialRequest, /^\s+calificacion:/m);
  assert.match(openApi, /notaExamenHomologacion: \{ type: integer, minimum: 0, maximum: 10 \}/);
  assert.match(openApi, /ResolverHomologacionRequest:[\s\S]*accion:[\s\S]*enum: \[APROBAR, RECHAZAR\]/);
  assert.match(openApi, /HomologacionDto:/);
  assert.match(openApi, /HomologacionListResponse:[\s\S]*data:[\s\S]*HomologacionDto/);
  assert.match(openApi, /HomologacionResponse:[\s\S]*data:[\s\S]*HomologacionDto/);
  assert.match(openApi, /alumnoId: \{ type: integer, minimum: 1, description: Usuario\.idUsuario público \}/);

  const roleMatrix: Array<[string, string]> = [
    ['/homologaciones/mis-solicitudes', 'ALUMNO'],
    ['/homologaciones', 'ADMINISTRATIVO'],
    ['/homologaciones/{id}', 'ADMINISTRATIVO'],
    ['/homologaciones/{id}/nota-complementaria', 'ADMINISTRATIVO'],
    ['/homologaciones/{id}/resolver', 'ADMINISTRATIVO']
  ];
  for (const [path, role] of roleMatrix) {
    assert.match(pathBlock(path), new RegExp(`x-roles: \\[${role}\\]`), path);
  }
});
