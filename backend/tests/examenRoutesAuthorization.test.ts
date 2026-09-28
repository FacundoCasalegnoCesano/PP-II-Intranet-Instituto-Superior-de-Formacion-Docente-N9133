import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import userRepository from '../src/repositories/userRepository.js';
import { ROLES } from '../src/constants/roles.js';
import { generateAccessToken } from '../src/utils/jwt.js';

function token(rol: string): string {
  return generateAccessToken({ id: 99, email: 'test@instituto.edu.ar', dni: '12345678', nombre: 'Usuario Test', rol });
}

async function withServer<T>(operation: (baseUrl: string) => Promise<T>): Promise<T> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try { return await operation(`http://127.0.0.1:${port}`); }
  finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

test('el detalle de una mesa bloquea alumnos y admite administrativo y profesor', async () => {
  const originalUser = (userRepository as any).findById;
  const originalSession = (prisma as any).sesion.findFirst;
  (userRepository as any).findById = async () => ({ idUsuario: 99, email: 'test@instituto.edu.ar', dni: 12345678, apellidoNombre: 'Usuario Test', activo: true });
  (prisma as any).sesion.findFirst = async () => ({ id: 1 });
  try {
    await withServer(async (baseUrl) => {
      const request = (rol: string) => fetch(`${baseUrl}/api/examenes/7`, { headers: { Authorization: `Bearer ${token(rol)}` } });
      assert.equal((await request(ROLES.ALUMNO)).status, 403);
      assert.equal((await request(ROLES.ADMINISTRATIVO)).status, 404);
      assert.equal((await request(ROLES.PROFESOR)).status, 404);
    });
  } finally {
    (userRepository as any).findById = originalUser;
    (prisma as any).sesion.findFirst = originalSession;
  }
});
