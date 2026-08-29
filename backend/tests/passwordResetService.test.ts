import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import authService from '../src/services/authService.js';
import userRepository from '../src/repositories/userRepository.js';
import passwordResetTokenRepository from '../src/repositories/passwordResetTokenRepository.js';

function replaceMethod(target: Record<string, unknown>, key: string, replacement: unknown): () => void {
  const original = target[key];
  target[key] = replacement;
  return () => { target[key] = original; };
}

const publicMessage = 'Si el email existe, recibirás un enlace para recuperar tu contraseña';

test('forgot password crea un token hash y envía el token solo al correo', async () => {
  let sentToken = '';
  let created: any;
  const restoreUser = replaceMethod(userRepository as any, 'findByEmail', async () => ({
    idUsuario: 21,
    email: 'alumno@example.com',
    apellidoNombre: 'Alumno Ejemplo',
    activo: true
  }));
  const restoreInvalidate = replaceMethod(passwordResetTokenRepository as any, 'invalidateForUser', async () => undefined);
  const restoreCreate = replaceMethod(passwordResetTokenRepository as any, 'create', async (data: any) => {
    created = data;
    return { id: 1, ...data };
  });
  const restoreDelete = replaceMethod(passwordResetTokenRepository as any, 'deleteByHash', async () => undefined);
  const restoreRecent = replaceMethod(passwordResetTokenRepository as any, 'hasRecentRequest', async () => false);

  try {
    const result = await authService.forgotPassword('ALUMNO@EXAMPLE.COM', {
      sendEmail: async (_email, token) => { sentToken = token; return {} as any; },
      now: () => new Date('2026-08-27T12:00:00.000Z')
    });

    assert.deepEqual(result, { message: publicMessage });
    assert.equal(sentToken.length, 43);
    assert.notEqual(created.tokenHash, sentToken);
    assert.equal(created.tokenHash, crypto.createHash('sha256').update(sentToken).digest('hex'));
    assert.equal(created.usuarioId, 21);
    assert.equal(created.expiresAt.toISOString(), '2026-08-27T13:00:00.000Z');
  } finally {
    restoreDelete();
    restoreRecent();
    restoreCreate();
    restoreInvalidate();
    restoreUser();
  }
});

test('forgot password no revela si el correo no existe ni intenta enviar', async () => {
  let sendCalls = 0;
  const restoreUser = replaceMethod(userRepository as any, 'findByEmail', async () => null);

  try {
    const result = await authService.forgotPassword('inexistente@example.com', {
      sendEmail: async () => { sendCalls += 1; return {} as any; }
    });

    assert.deepEqual(result, { message: publicMessage });
    assert.equal(sendCalls, 0);
  } finally {
    restoreUser();
  }
});

test('reset password solo pasa el hash al consumo atómico del repositorio', async () => {
  let consumed: any;
  const restoreConsume = replaceMethod(passwordResetTokenRepository as any, 'consumeAndReset', async (data: any) => {
    consumed = data;
    return { usuarioId: 21 };
  });

  try {
    const result = await authService.resetPassword('token-opaco', 'NuevaClave123!');

    assert.deepEqual(result, { message: 'Contraseña restablecida exitosamente' });
    assert.equal(consumed.tokenHash, crypto.createHash('sha256').update('token-opaco').digest('hex'));
    assert.equal(consumed.token, undefined);
    assert.equal(consumed.newPassword, undefined);
    assert.equal(typeof consumed.newPasswordHash, 'string');
  } finally {
    restoreConsume();
  }
});

test('verify reset token consulta por hash y solo revela el correo asociado a un token válido', async () => {
  const restoreFind = replaceMethod(passwordResetTokenRepository as any, 'findValidByHash', async () => ({
    usuario: { email: 'alumno@example.com' }
  }));

  try {
    const result = await authService.verifyResetToken('token-valido');
    assert.deepEqual(result, { valid: true, email: 'alumno@example.com' });
  } finally {
    restoreFind();
  }
});

test('verify reset token responde inválido sin filtrar el motivo', async () => {
  const restoreFind = replaceMethod(passwordResetTokenRepository as any, 'findValidByHash', async () => null);

  try {
    const result = await authService.verifyResetToken('token-invalido');
    assert.deepEqual(result, { valid: false });
  } finally {
    restoreFind();
  }
});

test('forgot password respeta el intervalo mínimo por usuario', async () => {
  let createCalls = 0;
  let sendCalls = 0;
  const restoreUser = replaceMethod(userRepository as any, 'findByEmail', async () => ({
    idUsuario: 21,
    email: 'alumno@example.com',
    apellidoNombre: 'Alumno Ejemplo',
    activo: true
  }));
  const restoreRecent = replaceMethod(passwordResetTokenRepository as any, 'hasRecentRequest', async () => true);
  const restoreCreate = replaceMethod(passwordResetTokenRepository as any, 'create', async () => { createCalls += 1; });

  try {
    const result = await authService.forgotPassword('alumno@example.com', {
      sendEmail: async () => { sendCalls += 1; return {} as any; }
    });
    assert.deepEqual(result, { message: publicMessage });
    assert.equal(createCalls, 0);
    assert.equal(sendCalls, 0);
  } finally {
    restoreCreate();
    restoreRecent();
    restoreUser();
  }
});

test('forgot password elimina el token si falla la entrega SMTP', async () => {
  let deletedHash = '';
  const restoreUser = replaceMethod(userRepository as any, 'findByEmail', async () => ({
    idUsuario: 21,
    email: 'alumno@example.com',
    apellidoNombre: 'Alumno Ejemplo',
    activo: true
  }));
  const restoreRecent = replaceMethod(passwordResetTokenRepository as any, 'hasRecentRequest', async () => false);
  const restoreInvalidate = replaceMethod(passwordResetTokenRepository as any, 'invalidateForUser', async () => undefined);
  const restoreCreate = replaceMethod(passwordResetTokenRepository as any, 'create', async () => undefined);
  const restoreDelete = replaceMethod(passwordResetTokenRepository as any, 'deleteByHash', async (hash: string) => { deletedHash = hash; });

  try {
    const result = await authService.forgotPassword('alumno@example.com', {
      sendEmail: async () => { throw new Error('535 secret provider detail'); }
    });
    assert.deepEqual(result, { message: publicMessage });
    assert.match(deletedHash, /^[a-f0-9]{64}$/);
  } finally {
    restoreDelete();
    restoreCreate();
    restoreInvalidate();
    restoreRecent();
    restoreUser();
  }
});
