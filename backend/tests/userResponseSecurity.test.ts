import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import authService from '../src/services/authService.js';
import userService from '../src/services/userService.js';
import userRepository from '../src/repositories/userRepository.js';
import { prisma } from '../src/config/prisma.js';
import { hashPassword } from '../src/utils/bcrypt.js';
import { ROLES } from '../src/constants/roles.js';
import { toPublicUser } from '../src/utils/publicUser.js';

const restorations: Array<() => void> = [];

function replaceMethod<T extends object, K extends keyof T>(target: T, key: K, replacement: T[K]) {
  const original = target[key];
  target[key] = replacement;
  restorations.push(() => {
    target[key] = original;
  });
}

function assertNoInternalCredentials(user: Record<string, unknown>) {
  assert.equal('passwordHash' in user, false);
  assert.equal('backupCodes' in user, false);
}

afterEach(() => {
  while (restorations.length > 0) restorations.pop()?.();
});

test('register no expone credenciales internas del usuario', async () => {
  replaceMethod(userRepository, 'findByEmailOrDni', async () => null);
  replaceMethod(userRepository, 'create', async (data) => ({
    idUsuario: 20,
    apellidoNombre: data.apellidoNombre,
    dni: Number(data.dni),
    email: data.email,
    fechaNacimiento: new Date(data.fechaNacimiento),
    telefono: data.telefono,
    passwordHash: data.passwordHash,
    cuil: data.cuil,
    activo: true,
    rol: data.rol,
    contactoEmergencia: null,
    foto: null,
    backupCodes: 'encrypted-backup-codes',
    ultimoAcceso: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01')
  }) as any);

  const result = await authService.register({
    apellidoNombre: 'Profesor Seguro',
    dni: '30111222',
    email: 'seguro@example.com',
    fechaNacimiento: '1980-01-01',
    telefono: '3400000000',
    password: 'Clave123!',
    cuil: '20-30111222-3',
    rol: ROLES.PROFESOR
  });

  assertNoInternalCredentials(result);
});

test('login no expone credenciales internas del usuario', async () => {
  const passwordHash = await hashPassword('Clave123!');
  replaceMethod(userRepository, 'findByEmailOrDni', async () => ({
    idUsuario: 20,
    apellidoNombre: 'Usuario Seguro',
    dni: 30111222,
    email: 'seguro@example.com',
    fechaNacimiento: new Date('1980-01-01'),
    telefono: '3400000000',
    passwordHash,
    cuil: '20-30111222-3',
    activo: true,
    rol: ROLES.PROFESOR,
    contactoEmergencia: null,
    foto: null,
    backupCodes: 'encrypted-backup-codes',
    ultimoAcceso: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01')
  }) as any);
  replaceMethod(userRepository, 'updateLastAccess', async () => ({}) as any);
  replaceMethod(userRepository, 'clearLoginFailures', async () => ({}) as any);
  replaceMethod(prisma.sesion, 'create', async () => ({ id: 99 }) as any);

  const result = await authService.login('seguro@example.com', 'Clave123!', undefined, undefined);

  assertNoInternalCredentials(result.user);
});

test('login rechaza con mensaje genérico una cuenta bloqueada', async () => {
  replaceMethod(userRepository, 'findByEmailOrDni', async () => ({
    idUsuario: 21,
    email: 'bloqueado@example.com',
    loginLockedUntil: new Date(Date.now() + 60_000),
    activo: true,
    passwordHash: 'unused',
    dni: 30111223,
    apellidoNombre: 'Usuario Bloqueado',
    rol: ROLES.PROFESOR
  }) as any);

  await assert.rejects(
    () => authService.login('bloqueado@example.com', 'Clave123!', undefined, undefined),
    { message: 'Credenciales inválidas' }
  );
});

test('login registra el intento cuando la contraseña es inválida', async () => {
  const passwordHash = await hashPassword('OtraClave123!');
  let failures = 0;
  replaceMethod(userRepository, 'findByEmailOrDni', async () => ({
    idUsuario: 22,
    email: 'invalido@example.com',
    loginLockedUntil: null,
    activo: true,
    passwordHash,
    dni: 30111224,
    apellidoNombre: 'Usuario Inválido',
    rol: ROLES.PROFESOR
  }) as any);
  replaceMethod(userRepository, 'recordLoginFailure', async () => { failures += 1; return {} as any; });

  await assert.rejects(
    () => authService.login('invalido@example.com', 'Clave123!', undefined, undefined),
    { message: 'Credenciales inválidas' }
  );
  assert.equal(failures, 1);
});

test('login limpia los fallos al autenticarse correctamente', async () => {
  const passwordHash = await hashPassword('Clave123!');
  let cleared = 0;
  replaceMethod(userRepository, 'findByEmailOrDni', async () => ({
    idUsuario: 23,
    email: 'correcto@example.com',
    loginLockedUntil: null,
    activo: true,
    passwordHash,
    dni: 30111225,
    apellidoNombre: 'Usuario Correcto',
    rol: ROLES.PROFESOR
  }) as any);
  replaceMethod(userRepository, 'clearLoginFailures', async () => { cleared += 1; return {} as any; });
  replaceMethod(userRepository, 'updateLastAccess', async () => ({}) as any);
  replaceMethod(prisma.sesion, 'create', async () => ({ id: 100 }) as any);

  await authService.login('correcto@example.com', 'Clave123!', undefined, undefined);
  assert.equal(cleared, 1);
});

test('login ejecuta una comparación bcrypt para un identificador inexistente', async () => {
  const bcrypt = await import('bcryptjs');
  const originalCompare = bcrypt.default.compare;
  let comparisons = 0;
  bcrypt.default.compare = async (...args: Parameters<typeof originalCompare>) => {
    comparisons += 1;
    return originalCompare(...args);
  };
  replaceMethod(userRepository, 'findByEmailOrDni', async () => null);

  try {
    await assert.rejects(
      () => authService.login('no-existe@example.com', 'Clave123!', undefined, undefined),
      { message: 'Credenciales inválidas' }
    );
    assert.equal(comparisons, 1);
  } finally {
    bcrypt.default.compare = originalCompare;
  }
});

test('toPublicUser excluye también los contadores de bloqueo de login', () => {
  const user = toPublicUser({
    idUsuario: 20,
    email: 'seguro@example.com',
    passwordHash: 'hash',
    backupCodes: 'encrypted',
    loginFailedCount: 4,
    loginLockedUntil: new Date('2026-08-27T12:00:00.000Z')
  });

  assert.equal('passwordHash' in user, false);
  assert.equal('backupCodes' in user, false);
  assert.equal('loginFailedCount' in user, false);
  assert.equal('loginLockedUntil' in user, false);
});

test('toPublicUser excluye el historial y los metadatos de sesiones', () => {
  const user = toPublicUser({
    idUsuario: 20,
    sesiones: [{ id: 1, ipAddress: '192.0.2.1', creadaEn: new Date() }]
  });

  assert.equal('sesiones' in user, false);
});

test('cambio de rol no expone credenciales internas del usuario', async () => {
  replaceMethod(userRepository, 'findById', async () => ({
    idUsuario: 20,
    rol: ROLES.ALUMNO,
    passwordHash: 'hashed-password',
    backupCodes: 'encrypted-backup-codes'
  }) as any);
  replaceMethod(userRepository, 'update', async () => ({}) as any);
  replaceMethod(prisma.sesion, 'updateMany', async () => ({ count: 0 }) as any);

  const result = await userService.changeUserRole(
    20,
    ROLES.PROFESOR,
    { id: 1, email: 'admin@example.com', dni: '30000000', rol: ROLES.ADMINISTRATIVO, nombre: 'Admin' }
  );

  assertNoInternalCredentials(result);
});
