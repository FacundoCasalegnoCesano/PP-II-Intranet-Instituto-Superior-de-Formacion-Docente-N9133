import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prisma } from '../src/config/prisma.js';
import passwordResetTokenRepository from '../src/repositories/passwordResetTokenRepository.js';

function replaceMethod(target: Record<string, unknown>, key: string, replacement: unknown): () => void {
  const original = target[key];
  target[key] = replacement;
  return () => { target[key] = original; };
}

test('consumeAndReset reclama el token antes de actualizar contraseña y sesiones en una transacción', async () => {
  const events: string[] = [];
  let passwordData: unknown;
  let sessionData: unknown;
  const tx = {
    passwordResetToken: {
      findFirst: async () => {
        events.push('find');
        return { id: 4, usuarioId: 21 };
      },
      updateMany: async () => {
        events.push('claim');
        return { count: 1 };
      }
    },
    usuario: {
      update: async ({ data }: any) => {
        events.push('password');
        passwordData = data;
        return {};
      }
    },
    sesion: {
      updateMany: async ({ data }: any) => {
        events.push('sessions');
        sessionData = data;
        return { count: 2 };
      }
    }
  };
  const restoreTransaction = replaceMethod(prisma as any, '$transaction', async (callback: any) => callback(tx));

  try {
    const now = new Date('2026-08-27T12:00:00.000Z');
    const result = await passwordResetTokenRepository.consumeAndReset({
      tokenHash: 'a'.repeat(64),
      newPasswordHash: 'bcrypt-hash',
      now
    });

    assert.deepEqual(result, { usuarioId: 21 });
    assert.deepEqual(events, ['find', 'claim', 'password', 'sessions']);
    assert.deepEqual(passwordData, { passwordHash: 'bcrypt-hash' });
    assert.deepEqual(sessionData, { revocadaEn: now, cerradaEn: now });
  } finally {
    restoreTransaction();
  }
});

test('consumeAndReset no cambia contraseña si otro proceso ya consumió el token', async () => {
  const events: string[] = [];
  const tx = {
    passwordResetToken: {
      findFirst: async () => ({ id: 4, usuarioId: 21 }),
      updateMany: async () => {
        events.push('claim');
        return { count: 0 };
      }
    },
    usuario: { update: async () => { events.push('password'); } },
    sesion: { updateMany: async () => { events.push('sessions'); } }
  };
  const restoreTransaction = replaceMethod(prisma as any, '$transaction', async (callback: any) => callback(tx));

  try {
    await assert.rejects(
      passwordResetTokenRepository.consumeAndReset({ tokenHash: 'b'.repeat(64), newPasswordHash: 'hash' }),
      /Token inválido o expirado/
    );
    assert.deepEqual(events, ['claim']);
  } finally {
    restoreTransaction();
  }
});
