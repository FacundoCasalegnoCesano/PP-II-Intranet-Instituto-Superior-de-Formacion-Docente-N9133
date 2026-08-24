import { readFile } from 'node:fs/promises';

const yaml = await readFile(new URL('../openapi.yaml', import.meta.url), 'utf8');
const results = JSON.parse(await readFile(new URL('../test-results/endpoints-happy-path.json', import.meta.url), 'utf8'));
const operations = [];
let currentPath = '';
for (const line of yaml.split(/\r?\n/)) {
  const path = line.match(/^  (\/[^:]*):\s*$/);
  if (path) currentPath = path[1];
  const method = line.match(/^    (get|post|put|patch|delete):\s*$/);
  if (currentPath && method) operations.push({ method: method[1].toUpperCase(), path: currentPath });
  if (/^components:/.test(line)) break;
}

const covered = operation => results.some(row => {
  if (row.metodo !== operation.method) return false;
  const pathname = String(row.endpoint).split('?')[0];
  const pattern = '^' + operation.path
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\{[^}]+\\\}/g, '[^/]+') + '$';
  return new RegExp(pattern).test(pathname);
});

const missing = operations.filter(operation => !covered(operation));
process.stdout.write(JSON.stringify({ operations: operations.length, covered: operations.length - missing.length, missing }, null, 2));
