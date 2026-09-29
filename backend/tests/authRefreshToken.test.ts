import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prisma } from '../src/config/prisma.js';
import authService from '../src/services/authService.js';
import userRepository from '../src/repositories/userRepository.js';
import { generateRefreshToken, hashRefreshToken } from '../src/utils/jwt.js';

function replaceMethod(target: Record<string, unknown>, key: string, replacement: unknown): () => void {
  const original = target[key];
  target[key] = replacement;
  return () => { target[key] = original; };
}

test('refresh replay revoca y cierra la familia antes de lanzar el error', async () => {
  const refreshToken = generateRefreshToken({
    id: 21,
    email: 'alumno@example.com',
    dni: '42123456',
    nombre: 'Alumno Ejemplo',
    rol: 'ALUMNO',
    familiaId: 'familia-1'
  });
  const now = new Date();
  const session = {
    id: 7,
    refreshTokenHash: hashRefreshToken(refreshToken),
    refreshTokenExpira: new Date(now.getTime() + 60_000),
    familiaId: 'familia-1',
    usuarioId: 21,
    ipAddress: null,
    userAgent: null
  };
  const familyRevocations: any[] = [];
  const restoreUser = replaceMethod(userRepository as any, 'findById', async () => ({
    idUsuario: 21,
    email: 'alumno@example.com',
    dni: 42123456,
    apellidoNombre: 'Alumno Ejemplo',
    activo: true
  }));
  const restoreFind = replaceMethod(prisma.sesion as any, 'findFirst', async () => session);
  const restoreTransaction = replaceMethod(prisma as any, '$transaction', async (callback: any) => {
    const pendingRevocations: any[] = [];
    try {
      const result = await callback({
        sesion: {
          updateMany: async ({ where, data }: any) => {
            if (where.id === session.id) return { count: 0 };
            pendingRevocations.push({ where, data });
            return { count: 2 };
          },
          create: async () => { throw new Error('replay must not create a session'); }
        }
      });
      familyRevocations.push(...pendingRevocations);
      return result;
    } catch (error) {
      throw error;
    }
  });

  try {
    await assert.rejects(authService.refreshToken(refreshToken), /Refresh token inválido o expirado/);
    assert.equal(familyRevocations.length, 1);
    assert.deepEqual(familyRevocations[0].where, { familiaId: 'familia-1', revocadaEn: null });
    assert.ok(familyRevocations[0].data.revocadaEn instanceof Date);
    assert.ok(familyRevocations[0].data.cerradaEn instanceof Date);
  } finally {
    restoreTransaction();
    restoreFind();
    restoreUser();
  }
});
