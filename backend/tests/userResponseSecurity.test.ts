import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import authService from '../src/services/authService.js';
import userService from '../src/services/userService.js';
import userRepository from '../src/repositories/userRepository.js';
import { prisma } from '../src/config/prisma.js';
import { hashPassword } from '../src/utils/bcrypt.js';
import { ROLES } from '../src/constants/roles.js';

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
  replaceMethod(prisma.sesion, 'create', async () => ({ id: 99 }) as any);

  const result = await authService.login('seguro@example.com', 'Clave123!', undefined, undefined);

  assertNoInternalCredentials(result.user);
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
