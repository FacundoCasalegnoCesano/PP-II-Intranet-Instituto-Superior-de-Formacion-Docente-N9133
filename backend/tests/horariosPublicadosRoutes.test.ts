import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const routesDir = new URL('../src/routes/', import.meta.url);

test('registra el módulo de horarios publicados en el router principal', () => {
  const index = readFileSync(new URL('index.ts', routesDir), 'utf8');

  assert.equal(existsSync(new URL('horariosPublicadosRoutes.ts', routesDir)), true);
  assert.match(index, /import horariosPublicadosRoutes from '\.\/horariosPublicadosRoutes\.js';/);
  assert.match(index, /router\.use\('\/horarios-publicados', horariosPublicadosRoutes\);/);
  const routes = readFileSync(new URL('horariosPublicadosRoutes.ts', routesDir), 'utf8');
  assert.match(routes, /multer\.memoryStorage\(\)/);
  assert.match(routes, /fileSize:\s*10 \* 1024 \* 1024/);
  assert.match(routes, /upload\.single\('archivo'\)/);
  assert.match(routes, /router\.post\('\/', roleCheck\(ROLES\.ADMINISTRATIVO\), cargarArchivo/);
});
