import { mkdir, readFile, writeFile } from 'node:fs/promises';

const inputUrl = new URL('../test-results/endpoints-happy-path.json', import.meta.url);
const outputUrl = new URL('../../docs/pruebas-endpoints-happy-path.md', import.meta.url);
const rows = JSON.parse(await readFile(inputUrl, 'utf8'));

const escapeCell = value => String(value ?? '—')
  .replaceAll('\\', '\\\\')
  .replaceAll('|', '\\|')
  .replaceAll('\r', ' ')
  .replaceAll('\n', '<br>');

const jsonCell = value => `\`${escapeCell(JSON.stringify(value))}\``;
const bodyCell = body => body === null ? 'No aplica' : jsonCell(body);
const responseCell = response => {
  if (response === null || response === undefined) return '—';
  return typeof response === 'string' ? escapeCell(response) : jsonCell(response);
};
const modules = new Map();
for (const row of rows) {
  if (!modules.has(row.modulo)) modules.set(row.modulo, []);
  modules.get(row.modulo).push(row);
}

const executed = rows.filter(row => typeof row.codigo === 'number');
const pending = rows.filter(row => typeof row.codigo !== 'number');
const lines = [
  '# Pruebas happy path de endpoints',
  '',
  `- Operaciones documentadas por rol: ${rows.length}`,
  `- Solicitudes ejecutadas: ${executed.length}`,
  `- Solicitudes exitosas: ${executed.filter(row => row.codigo < 400).length}`,
  `- Pendientes por configuración de correo: ${pending.length}`,
  '- Los campos sensibles se reemplazaron por marcadores como `<password>` y `<refreshToken>`.',
  ''
];

for (const [moduleName, moduleRows] of modules) {
  lines.push(`## ${moduleName}`, '');
  lines.push('| METODO | ENDPOINT | DESCRIPCION | BODY | RESPUESTA | CODIGO |');
  lines.push('|---|---|---|---|---|---|');
  for (const row of moduleRows) {
    lines.push(`| ${escapeCell(row.metodo)} | ${escapeCell(row.endpoint)} | ${escapeCell(row.descripcion)} | ${bodyCell(row.body)} | ${responseCell(row.respuesta)} | ${escapeCell(row.codigo)} |`);
  }
  lines.push('');
}

await mkdir(new URL('../../docs/', import.meta.url), { recursive: true });
await writeFile(outputUrl, `${lines.join('\n')}\n`, 'utf8');
process.stdout.write(JSON.stringify({ modules: modules.size, rows: rows.length, output: outputUrl.pathname }, null, 2));
