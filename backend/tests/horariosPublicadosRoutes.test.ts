import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import { app } from '../src/app.js';
import config from '../src/config/env.js';
import { prisma } from '../src/config/prisma.js';
import userRepository from '../src/repositories/userRepository.js';
import horarioPublicadoRepository from '../src/repositories/horarioPublicadoRepository.js';
import horarioPublicadoService from '../src/services/horarioPublicadoService.js';
import { ROLES } from '../src/constants/roles.js';
import { generateAccessToken } from '../src/utils/jwt.js';

const routesDir = new URL('../src/routes/', import.meta.url);

function replaceMethod(target: Record<string, unknown>, key: string, replacement: unknown): () => void {
  const original = target[key];
  target[key] = replacement;
  return () => { target[key] = original; };
}

function token(rol: string): string {
  return generateAccessToken({ id: 99, email: 'test@instituto.edu.ar', dni: '12345678', nombre: 'Usuario Test', rol });
}

async function withServer<T>(operation: (baseUrl: string) => Promise<T>): Promise<T> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    return await operation(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

function prepararAutenticacion(): () => void {
  const restoreUser = replaceMethod(userRepository as any, 'findById', async () => ({
    idUsuario: 99, email: 'test@instituto.edu.ar', dni: 12345678, apellidoNombre: 'Usuario Test', activo: true
  }));
  const restoreSesion = replaceMethod((prisma as any).sesion, 'findFirst', async () => ({ id: 1 }));
  return () => { restoreSesion(); restoreUser(); };
}

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

test('la frontera HTTP exige rol administrativo y transforma un multipart inválido en el envelope 400', async () => {
  const restore = prepararAutenticacion();
  try {
    await withServer(async (baseUrl) => {
      const sinPermiso = await fetch(`${baseUrl}/api/horarios-publicados`, {
        method: 'POST', headers: { Authorization: `Bearer ${token(ROLES.ALUMNO)}` }, body: new FormData()
      });
      assert.equal(sinPermiso.status, 403);
      assert.equal((await sinPermiso.json()).success, false);

      const datos = new FormData();
      datos.append('cicloLectivo', '2026');
      datos.append('archivo', new Blob(['%PDF-1.7']), 'uno.pdf');
      datos.append('archivo', new Blob(['%PDF-1.7']), 'dos.pdf');
      const multiplo = await fetch(`${baseUrl}/api/horarios-publicados`, {
        method: 'POST', headers: { Authorization: `Bearer ${token(ROLES.ADMINISTRATIVO)}` }, body: datos
      });
      assert.equal(multiplo.status, 400);
      const cuerpo = await multiplo.json();
      assert.equal(cuerpo.success, false);
      assert.match(cuerpo.message, /archivo/i);
    });
  } finally { restore(); }
});

test('la descarga HTTP entrega vigente, bloquea histórico y aplica cabeceras privadas seguras', async () => {
  const directorioTemporal = await mkdtemp(path.join(tmpdir(), 'horarios-publicados-rutas-'));
  const clave = randomUUID();
  const ruta = path.join(directorioTemporal, `${clave}.pdf`);
  const storageDirOriginal = (horarioPublicadoService as any).storageDir;
  let restore = () => {};
  let restoreDocumento = () => {};
  try {
    (horarioPublicadoService as any).storageDir = directorioTemporal;
    assert.notEqual(path.resolve(directorioTemporal), path.resolve(config.horariosStorageDir), 'la prueba no debe escribir en el almacenamiento configurado');
    const documento = (vigente: boolean) => ({
      id: 41, cicloLectivo: 2026, titulo: 'Título que no debe ir al header', nombreOriginal: '../inseguro.pdf',
      claveInterna: clave, tamanio: 8, sha256: 'b'.repeat(64), publicadorId: 99, createdAt: new Date(),
      publicacionVigente: vigente ? { cicloLectivo: 2026 } : null, publicador: null
    });
    await writeFile(ruta, '%PDF-1.7');
    restore = prepararAutenticacion();
    restoreDocumento = replaceMethod(horarioPublicadoRepository as any, 'buscarPorId', async () => documento(true));
    await withServer(async (baseUrl) => {
      const vigente = await fetch(`${baseUrl}/api/horarios-publicados/41/archivo`, {
        headers: { Authorization: `Bearer ${token(ROLES.ALUMNO)}` }
      });
      assert.equal(vigente.status, 200);
      assert.equal(vigente.headers.get('cache-control'), 'private, no-store');
      assert.equal(vigente.headers.get('content-disposition'), 'attachment; filename="horario-2026.pdf"');
      assert.doesNotMatch(vigente.headers.get('content-disposition') ?? '', new RegExp(`${clave}|inseguro|Título`));

      (horarioPublicadoRepository as any).buscarPorId = async () => documento(false);
      const historico = await fetch(`${baseUrl}/api/horarios-publicados/41/archivo`, {
        headers: { Authorization: `Bearer ${token(ROLES.ALUMNO)}` }
      });
      assert.equal(historico.status, 403);
      assert.equal((await historico.json()).success, false);
    });
  } finally {
    restoreDocumento();
    restore();
    (horarioPublicadoService as any).storageDir = storageDirOriginal;
    await rm(directorioTemporal, { recursive: true, force: true });
  }
});
