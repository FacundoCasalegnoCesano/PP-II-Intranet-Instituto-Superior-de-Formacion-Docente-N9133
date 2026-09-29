import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import authService from '../src/services/authService.js';
import userRepository from '../src/repositories/userRepository.js';
import passwordResetTokenRepository from '../src/repositories/passwordResetTokenRepository.js';
import { encryptBackupCodes, decryptBackupCodes } from '../src/utils/backupCodes.js';

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
  const restoreIssue = replaceMethod(passwordResetTokenRepository as any, 'issueIfAllowed', async (data: any) => {
    created = data;
    return true;
  });
  const restoreDelete = replaceMethod(passwordResetTokenRepository as any, 'deleteByHash', async () => undefined);

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
    restoreIssue();
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
  let issueCalls = 0;
  let sendCalls = 0;
  const restoreUser = replaceMethod(userRepository as any, 'findByEmail', async () => ({
    idUsuario: 21,
    email: 'alumno@example.com',
    apellidoNombre: 'Alumno Ejemplo',
    activo: true
  }));
  const restoreIssue = replaceMethod(passwordResetTokenRepository as any, 'issueIfAllowed', async () => { issueCalls += 1; return false; });

  try {
    const result = await authService.forgotPassword('alumno@example.com', {
      sendEmail: async () => { sendCalls += 1; return {} as any; }
    });
    assert.deepEqual(result, { message: publicMessage });
    assert.equal(issueCalls, 1);
    assert.equal(sendCalls, 0);
  } finally {
    restoreIssue();
    restoreUser();
  }
});

test('forgot password elimina el token si falla la entrega de correo', async () => {
  let deletedHash = '';
  const restoreUser = replaceMethod(userRepository as any, 'findByEmail', async () => ({
    idUsuario: 21,
    email: 'alumno@example.com',
    apellidoNombre: 'Alumno Ejemplo',
    activo: true
  }));
  const restoreIssue = replaceMethod(passwordResetTokenRepository as any, 'issueIfAllowed', async () => true);
  const restoreDelete = replaceMethod(passwordResetTokenRepository as any, 'deleteByHash', async (hash: string) => { deletedHash = hash; });

  try {
    const result = await authService.forgotPassword('alumno@example.com', {
      sendEmail: async () => { throw new Error('535 secret provider detail'); }
    });
    assert.deepEqual(result, { message: publicMessage });
    assert.match(deletedHash, /^[a-f0-9]{64}$/);
  } finally {
    restoreDelete();
    restoreIssue();
    restoreUser();
  }
});

test('recovery con código delega el consumo CAS y el reseteo de credenciales en una sola operación', async () => {
  const backupCodes = encryptBackupCodes(['CODE-1', 'CODE-2']);
  let received: any;
  const restoreUser = replaceMethod(userRepository as any, 'findByEmail', async () => ({
    idUsuario: 30,
    email: 'admin@example.com',
    apellidoNombre: 'Admin',
    rol: 'ADMINISTRATIVO',
    activo: false,
    backupCodes
  }));
  const restoreConsume = replaceMethod(passwordResetTokenRepository as any, 'consumeBackupCodeAndReset', async (data: any) => {
    received = data;
    return { remainingCodes: data.remainingCodes };
  });

  try {
    const result = await authService.recoveryWithBackupCode('admin@example.com', 'CODE-1', 'NuevaClave123!');

    assert.deepEqual(result, { remainingCodes: 1 });
    assert.equal(received.usuarioId, 30);
    assert.equal(received.expectedBackupCodes, backupCodes);
    assert.deepEqual(decryptBackupCodes(received.replacementBackupCodes), ['CODE-2']);
    assert.equal(received.remainingCodes, 1);
    assert.match(received.newPasswordHash, /^\$2[aby]\$/);
  } finally {
    restoreConsume();
    restoreUser();
  }
});
