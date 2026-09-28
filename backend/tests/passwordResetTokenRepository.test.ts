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
  let tokenUpdates = 0;
  let passwordData: unknown;
  let sessionData: unknown;
  const tx = {
    passwordResetToken: {
      findFirst: async () => {
        events.push('find');
        return { id: 4, usuarioId: 21 };
      },
      updateMany: async () => {
        events.push(tokenUpdates++ === 0 ? 'claim' : 'invalidate-pending');
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
    assert.deepEqual(events, ['find', 'claim', 'invalidate-pending', 'password', 'sessions']);
    assert.deepEqual(passwordData, {
      passwordHash: 'bcrypt-hash',
      loginFailedCount: 0,
      loginLockedUntil: null
    });
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

test('consumeAndReset invalida todos los tokens pendientes del usuario tras reclamar el presentado', async () => {
  const updates: any[] = [];
  const tx = {
    passwordResetToken: {
      findFirst: async () => ({ id: 4, usuarioId: 21 }),
      updateMany: async (args: any) => {
        updates.push(args);
        return { count: 1 };
      }
    },
    usuario: { update: async () => ({}) },
    sesion: { updateMany: async () => ({ count: 1 }) }
  };
  const restoreTransaction = replaceMethod(prisma as any, '$transaction', async (callback: any) => callback(tx));

  try {
    await passwordResetTokenRepository.consumeAndReset({
      tokenHash: 'c'.repeat(64),
      newPasswordHash: 'hash',
      now: new Date('2026-08-27T12:00:00.000Z')
    });
    assert.deepEqual(updates.map(({ where }) => where), [
      { id: 4, usedAt: null, expiresAt: { gt: new Date('2026-08-27T12:00:00.000Z') } },
      { usuarioId: 21, usedAt: null }
    ]);
  } finally {
    restoreTransaction();
  }
});

test('resetPasswordForUser limpia el bloqueo de login dentro de la misma actualización', async () => {
  let receivedData: unknown;
  const tx = {
    passwordResetToken: { updateMany: async () => ({ count: 1 }) },
    usuario: { update: async ({ data }: any) => { receivedData = data; return {}; } },
    sesion: { updateMany: async () => ({ count: 1 }) }
  };
  const restoreTransaction = replaceMethod(prisma as any, '$transaction', async (callback: any) => callback(tx));

  try {
    await passwordResetTokenRepository.resetPasswordForUser(20, 'hash-reset');
    assert.deepEqual(receivedData, {
      passwordHash: 'hash-reset',
      loginFailedCount: 0,
      loginLockedUntil: null
    });
  } finally {
    restoreTransaction();
  }
});

test('consumeBackupCodeAndReset usa compare-and-swap y no actualiza nada si perdió la carrera', async () => {
  const events: string[] = [];
  const tx = {
    passwordResetToken: { updateMany: async () => { events.push('tokens'); return { count: 1 }; } },
    usuario: {
      updateMany: async () => { events.push('claim'); return { count: 0 }; },
      update: async () => { events.push('password'); return {}; }
    },
    sesion: { updateMany: async () => { events.push('sessions'); return { count: 1 }; } }
  };
  const restoreTransaction = replaceMethod(prisma as any, '$transaction', async (callback: any) => callback(tx));

  try {
    await assert.rejects(
      passwordResetTokenRepository.consumeBackupCodeAndReset({
        usuarioId: 20,
        expectedBackupCodes: 'old-ciphertext',
        replacementBackupCodes: 'new-ciphertext',
        newPasswordHash: 'new-hash'
      }),
      /Código inválido/
    );
    assert.deepEqual(events, ['tokens', 'claim']);
  } finally {
    restoreTransaction();
  }
});

test('consumeBackupCodeAndReset actualiza contraseña, códigos, bloqueo, tokens y sesiones en una transacción', async () => {
  const calls: string[] = [];
  let userData: unknown;
  const tx = {
    passwordResetToken: { updateMany: async () => { calls.push('tokens'); return { count: 1 }; } },
    usuario: {
      updateMany: async ({ data }: any) => { calls.push('claim'); userData = data; return { count: 1 }; }
    },
    sesion: { updateMany: async () => { calls.push('sessions'); return { count: 1 }; } }
  };
  const restoreTransaction = replaceMethod(prisma as any, '$transaction', async (callback: any) => callback(tx));

  try {
    const result = await passwordResetTokenRepository.consumeBackupCodeAndReset({
      usuarioId: 20,
      expectedBackupCodes: 'old-ciphertext',
      replacementBackupCodes: 'new-ciphertext',
      newPasswordHash: 'new-hash',
      now: new Date('2026-08-27T12:00:00.000Z'),
      remainingCodes: 7
    });
    assert.deepEqual(result, { remainingCodes: 7 });
    assert.deepEqual(calls, ['tokens', 'claim', 'sessions']);
    assert.deepEqual(userData, {
      backupCodes: 'new-ciphertext',
      passwordHash: 'new-hash',
      activo: true,
      loginFailedCount: 0,
      loginLockedUntil: null
    });
  } finally {
    restoreTransaction();
  }
});

test('issueIfAllowed serializa el cooldown y crea un único token cuando no existe solicitud reciente', async () => {
  let transactionOptions: any;
  const events: string[] = [];
  const tx = {
    passwordResetToken: {
      findFirst: async () => { events.push('recent'); return null; },
      updateMany: async () => { events.push('invalidate'); return { count: 1 }; },
      deleteMany: async () => { events.push('cleanup'); return { count: 0 }; },
      create: async ({ data }: any) => { events.push(`create:${data.usuarioId}`); return data; }
    }
  };
  const restoreTransaction = replaceMethod(prisma as any, '$transaction', async (callback: any, options: any) => {
    transactionOptions = options;
    return callback(tx);
  });

  try {
    const created = await passwordResetTokenRepository.issueIfAllowed({
      usuarioId: 20,
      tokenHash: 'hash',
      expiresAt: new Date('2026-08-27T13:00:00.000Z')
    }, new Date('2026-08-27T12:00:00.000Z'), new Date('2026-08-27T11:59:00.000Z'));
    assert.equal(created, true);
    assert.equal(transactionOptions.isolationLevel, 'Serializable');
    assert.deepEqual(events, ['recent', 'invalidate', 'cleanup', 'create:20']);
  } finally {
    restoreTransaction();
  }
});

test('issueIfAllowed rechaza la creación cuando la transacción detecta una solicitud reciente', async () => {
  const events: string[] = [];
  const tx = {
    passwordResetToken: {
      findFirst: async () => { events.push('recent'); return { id: 1 }; },
      updateMany: async () => { events.push('invalidate'); return { count: 1 }; },
      deleteMany: async () => { events.push('cleanup'); return { count: 0 }; },
      create: async () => { events.push('create'); return {}; }
    }
  };
  const restoreTransaction = replaceMethod(prisma as any, '$transaction', async (callback: any) => callback(tx));

  try {
    const created = await passwordResetTokenRepository.issueIfAllowed({
      usuarioId: 20,
      tokenHash: 'hash',
      expiresAt: new Date('2026-08-27T13:00:00.000Z')
    }, new Date('2026-08-27T12:00:00.000Z'), new Date('2026-08-27T11:59:00.000Z'));
    assert.equal(created, false);
    assert.deepEqual(events, ['recent']);
  } finally {
    restoreTransaction();
  }
});
