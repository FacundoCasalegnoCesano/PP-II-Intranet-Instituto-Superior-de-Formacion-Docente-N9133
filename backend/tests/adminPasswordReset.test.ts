import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { request } from 'node:http';

import { app } from '../src/app.js';
import userService from '../src/services/userService.js';
import userRepository from '../src/repositories/userRepository.js';
import passwordResetTokenRepository from '../src/repositories/passwordResetTokenRepository.js';
import { prisma } from '../src/config/prisma.js';
import { ROLES } from '../src/constants/roles.js';
import { generateAccessToken } from '../src/utils/jwt.js';
import { adminPasswordResetSchema } from '../src/validations/userValidation.js';

const restorations: Array<() => void> = [];

function replaceMethod(target: any, key: string, replacement: any) {
  const original = target[key];
  target[key] = replacement;
  restorations.push(() => {
    target[key] = original;
  });
}

const admin = {
  id: 1,
  email: 'admin@example.com',
  dni: '30000000',
  rol: ROLES.ADMINISTRATIVO,
  nombre: 'Administrativo'
};

function target(overrides: Record<string, unknown> = {}) {
  return {
    idUsuario: 20,
    email: 'destino@example.com',
    passwordHash: 'hash-anterior',
    activo: true,
    rol: ROLES.PROFESOR,
    ...overrides
  };
}

afterEach(() => {
  while (restorations.length > 0) restorations.pop()?.();
});

function requestJson(port: number, token: string | undefined, body: unknown, path: string) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const payload = JSON.stringify(body);
    const client = request({
      hostname: '127.0.0.1',
      port,
      path,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
        ...(token ? { authorization: `Bearer ${token}` } : {})
      }
    }, response => {
      let data = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { data += chunk; });
      response.on('end', () => resolve({
        status: response.statusCode ?? 0,
        body: data ? JSON.parse(data) : null
      }));
    });
    client.on('error', reject);
    client.write(payload);
    client.end();
  });
}

function listenOnEphemeralPort() {
  return new Promise<{ server: ReturnType<typeof app.listen>; port: number }>((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('No se pudo obtener el puerto de prueba'));
        return;
      }
      resolve({ server, port: address.port });
    });
    server.on('error', reject);
  });
}

test('el contrato HTTP real distingue 401, 403, ID estricto, 404, self-reset y 200', async () => {
  const adminToken = generateAccessToken({ id: 1, email: 'admin@example.com', dni: '30000000', nombre: 'Admin', rol: ROLES.ADMINISTRATIVO });
  const teacherToken = generateAccessToken({ id: 2, email: 'teacher@example.com', dni: '30000001', nombre: 'Teacher', rol: ROLES.PROFESOR });
  const records: Record<number, any> = {
    1: { idUsuario: 1, email: 'admin@example.com', dni: 30000000, apellidoNombre: 'Admin', rol: ROLES.ADMINISTRATIVO, activo: true },
    2: { idUsuario: 2, email: 'teacher@example.com', dni: 30000001, apellidoNombre: 'Teacher', rol: ROLES.PROFESOR, activo: true },
    20: { idUsuario: 20, email: 'target@example.com', dni: 30000020, apellidoNombre: 'Target', rol: ROLES.PROFESOR, activo: true },
  };
  const tx = {
    passwordResetToken: { updateMany: async () => ({ count: 1 }) },
    usuario: { update: async () => ({}) },
    sesion: { updateMany: async () => ({ count: 1 }) }
  };
  const serviceCalls: Array<[number, string, unknown]> = [];
  const resetCalls: Array<[number, string]> = [];
  const originalAdminResetPassword = userService.adminResetPassword;
  replaceMethod(userRepository, 'findById', async (id: number) => records[id] ?? null);
  replaceMethod(prisma.sesion, 'findFirst', async (args: any) => {
    const matchingUser = records[args.where.usuarioId];
    return matchingUser && args.where.cerradaEn === null && args.where.revocadaEn === null
      ? { id: args.where.usuarioId }
      : null;
  });
  replaceMethod(userService, 'adminResetPassword', async (...args: [number, string, unknown]) => {
    serviceCalls.push(args);
    return originalAdminResetPassword.apply(userService, args as any);
  });
  replaceMethod(passwordResetTokenRepository, 'resetPasswordForUser', async (userId: number, passwordHash: string) => {
    resetCalls.push([userId, passwordHash]);
  });
  replaceMethod(prisma, '$transaction', async (callback: any) => callback(tx));

  const { server, port } = await listenOnEphemeralPort();
  try {
    assert.equal((await requestJson(port, undefined, { newPassword: 'NuevaPass1!' }, '/api/users/20/password-reset')).status, 401);
    assert.equal((await requestJson(port, 'not-a-valid-token', { newPassword: 'NuevaPass1!' }, '/api/users/20/password-reset')).status, 401);
    assert.equal((await requestJson(port, teacherToken, { newPassword: 'NuevaPass1!' }, '/api/users/20/password-reset')).status, 403);
    assert.equal(serviceCalls.length, 0);
    assert.equal((await requestJson(port, adminToken, { newPassword: 'NuevaPass1!' }, '/api/users/20abc/password-reset')).status, 400);
    assert.equal(serviceCalls.length, 0);
    assert.equal((await requestJson(port, adminToken, { newPassword: 'NuevaPass1!' }, '/api/users/999/password-reset')).status, 404);
    assert.deepEqual(serviceCalls.at(-1)?.slice(0, 2), [999, 'NuevaPass1!']);
    assert.equal((await requestJson(port, adminToken, { newPassword: 'NuevaPass1!' }, '/api/users/1/password-reset')).status, 403);
    assert.deepEqual(serviceCalls.at(-1)?.slice(0, 2), [1, 'NuevaPass1!']);
    assert.equal(resetCalls.length, 0);
    const success = await requestJson(port, adminToken, { newPassword: 'NuevaPass1!' }, '/api/users/20/password-reset');
    assert.equal(success.status, 200);
    assert.deepEqual(success.body, { success: true, message: 'Contraseña restablecida exitosamente' });
    assert.deepEqual(serviceCalls.at(-1)?.slice(0, 2), [20, 'NuevaPass1!']);
    assert.equal(resetCalls.length, 1);
    assert.equal(resetCalls[0][0], 20);
    assert.notEqual(resetCalls[0][1], 'NuevaPass1!');
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('la política del restablecimiento exige solo newPassword y rechaza contraseñas inválidas', () => {
  assert.equal(adminPasswordResetSchema.validate({ newPassword: 'NuevaPass1!' }).error, undefined);
  assert.ok(adminPasswordResetSchema.validate({ newPassword: 'corta1!' }).error);
  assert.ok(adminPasswordResetSchema.validate({ newPassword: 'SinNumero!' }).error);
  assert.ok(adminPasswordResetSchema.validate({ newPassword: 'NuevaPass1!', extra: true }).error);
});

test('solo un administrativo puede restablecer y nunca puede hacerlo sobre sí mismo', async () => {
  replaceMethod(userRepository, 'findById', async () => target({ idUsuario: 1 }));

  await assert.rejects(
    userService.adminResetPassword(20, 'NuevaPass1!', { ...admin, rol: ROLES.PROFESOR }),
    (error: any) => error.statusCode === 403
  );
  await assert.rejects(
    userService.adminResetPassword(1, 'NuevaPass1!', admin),
    (error: any) => error.statusCode === 403
  );
});

test('rechaza contraseña inválida y usuario inexistente sin iniciar una operación de credenciales', async () => {
  let resetCalled = false;
  replaceMethod(passwordResetTokenRepository, 'resetPasswordForUser', async () => {
    resetCalled = true;
  });
  replaceMethod(userRepository, 'findById', async () => null);

  await assert.rejects(
    userService.adminResetPassword(20, 'invalida', admin),
    (error: any) => error.statusCode === 400
  );
  await assert.rejects(
    userService.adminResetPassword(20, 'NuevaPass1!', admin),
    (error: any) => error.statusCode === 404
  );
  assert.equal(resetCalled, false);
});

test('permite objetivo inactivo, cambia el hash sin exponer secretos y delega una sola operación atómica', async () => {
  replaceMethod(userRepository, 'findById', async () => target({ activo: false }));
  let received: any;
  replaceMethod(passwordResetTokenRepository, 'resetPasswordForUser', async (...args: any[]) => {
    received = args;
  });

  const result = await userService.adminResetPassword(20, 'NuevaPass1!', admin);

  assert.equal(received[0], 20);
  assert.notEqual(received[1], 'NuevaPass1!');
  assert.match(received[1], /^\$2[aby]\$/);
  assert.equal(result.message, 'Contraseña restablecida exitosamente');
  assert.equal(JSON.stringify(result).includes('NuevaPass1!'), false);
  assert.equal(JSON.stringify(result).includes(received[1]), false);
});

test('la operación transaccional actualiza hash, revoca sesiones y anula tokens pendientes', async () => {
  const calls: string[] = [];
  let transactionCount = 0;
  const tx = {
    usuario: {
      update: async (args: any) => {
        calls.push(`usuario:${args.where.idUsuario}`);
        assert.equal(args.data.passwordHash, 'hash-nuevo');
        return {};
      }
    },
    sesion: {
      updateMany: async (args: any) => {
        calls.push(`sesiones:${args.where.usuarioId}`);
        assert.equal(args.where.revocadaEn, null);
        assert.ok(args.data.revocadaEn instanceof Date);
        assert.ok(args.data.cerradaEn instanceof Date);
        return { count: 2 };
      }
    },
    passwordResetToken: {
      updateMany: async (args: any) => {
        calls.push(`tokens:${args.where.usuarioId}`);
        assert.equal(args.where.usedAt, null);
        assert.ok(args.data.usedAt instanceof Date);
        return { count: 3 };
      }
    }
  };
  replaceMethod(prisma, '$transaction', async (callback: any) => {
    transactionCount += 1;
    return callback(tx);
  });

  await passwordResetTokenRepository.resetPasswordForUser(20, 'hash-nuevo');

  assert.equal(transactionCount, 1);
  assert.deepEqual(calls, ['tokens:20', 'usuario:20', 'sesiones:20']);
});

test('ambos recorridos respetan el orden tokens, usuario y sesiones', async () => {
  const adminEvents: string[] = [];
  const publicEvents: string[] = [];
  const txForAdmin = {
    passwordResetToken: { updateMany: async () => { adminEvents.push('tokens'); return { count: 1 }; } },
    usuario: { update: async () => { adminEvents.push('usuario'); return {}; } },
    sesion: { updateMany: async () => { adminEvents.push('sesiones'); return { count: 1 }; } }
  };
  replaceMethod(prisma, '$transaction', async (callback: any) => callback(txForAdmin));
  await passwordResetTokenRepository.resetPasswordForUser(20, 'hash-admin');
  assert.deepEqual(adminEvents, ['tokens', 'usuario', 'sesiones']);

  const txForPublic = {
    passwordResetToken: {
      findFirst: async () => { publicEvents.push('tokens:find'); return { id: 4, usuarioId: 21 }; },
      updateMany: async () => { publicEvents.push('tokens'); return { count: 1 }; }
    },
    usuario: { update: async () => { publicEvents.push('usuario'); return {}; } },
    sesion: { updateMany: async () => { publicEvents.push('sesiones'); return { count: 1 }; } }
  };
  replaceMethod(prisma, '$transaction', async (callback: any) => callback(txForPublic));
  await passwordResetTokenRepository.consumeAndReset({ tokenHash: 'c'.repeat(64), newPasswordHash: 'hash-public' });
  assert.deepEqual(publicEvents, ['tokens:find', 'tokens', 'usuario', 'sesiones']);
});

test('un fallo intermedio rechaza la operación y no informa éxito; el rollback real queda a cargo de Prisma/MySQL', async () => {
  const calls: string[] = [];
  const tx = {
    passwordResetToken: { updateMany: async () => { calls.push('tokens'); return { count: 1 }; } },
    usuario: { update: async () => { calls.push('usuario'); return {}; } },
    sesion: { updateMany: async () => { calls.push('sesiones'); throw new Error('fallo intermedio'); } }
  };
  replaceMethod(prisma, '$transaction', async (callback: any) => callback(tx));

  await assert.rejects(
    passwordResetTokenRepository.resetPasswordForUser(20, 'hash-fallido'),
    /fallo intermedio/
  );
  assert.deepEqual(calls, ['tokens', 'usuario', 'sesiones']);
});

test('el éxito usa un único transaction client para hash, sesiones y tokens', async () => {
  let transactions = 0;
  const clients: unknown[] = [];
  const tx = {
    passwordResetToken: { updateMany: async () => { clients.push(tx.passwordResetToken); return { count: 1 }; } },
    usuario: { update: async () => { clients.push(tx.usuario); return {}; } },
    sesion: { updateMany: async () => { clients.push(tx.sesion); return { count: 1 }; } }
  };
  replaceMethod(prisma, '$transaction', async (callback: any) => { transactions += 1; return callback(tx); });

  await passwordResetTokenRepository.resetPasswordForUser(20, 'hash-unico');

  assert.equal(transactions, 1);
  assert.equal(clients.length, 3);
  assert.equal(new Set(clients).size, 3);
});
