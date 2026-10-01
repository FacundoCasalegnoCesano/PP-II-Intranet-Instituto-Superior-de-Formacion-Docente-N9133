import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import userRepository from '../src/repositories/userRepository.js';
import { prisma } from '../src/config/prisma.js';
import authService from '../src/services/authService.js';

const restorations: Array<() => void> = [];

function replaceMethod<T extends object, K extends keyof T>(target: T, key: K, replacement: T[K]) {
  const original = target[key];
  target[key] = replacement;
  restorations.push(() => { target[key] = original; });
}

afterEach(() => {
  while (restorations.length > 0) restorations.pop()?.();
});

test('crear usuario alumno persiste usuario y ficha mediante un nested write atómico', async () => {
  let createArgs: any;
  let createCalls = 0;
  replaceMethod(prisma.usuario, 'create', (async (args: any) => {
    createArgs = args;
    createCalls += 1;
    throw new Error('fallo al crear la ficha');
  }) as any);

  await assert.rejects(() => userRepository.create({
    apellidoNombre: 'Alumno de prueba', dni: '30111222', email: 'alumno@example.com',
    fechaNacimiento: '2000-01-01', telefono: '3400000000', passwordHash: 'hash',
    cuil: '20-30111222-3', rol: 'ALUMNO'
  }, { domicilio: 'Calle 1', anioEgreso: 2018, institucionProcedencia: null }), /fallo al crear la ficha/);

  assert.equal(createCalls, 1);
  assert.deepEqual(createArgs.data.alumno, {
    create: { domicilio: 'Calle 1', anioEgreso: 2018, institucionProcedencia: null }
  });
});

test('buscar usuario por id no consulta ni selecciona sesiones históricas', async () => {
  let queryArgs: any;
  replaceMethod(prisma.usuario, 'findUnique', (async (args: any) => {
    queryArgs = args;
    return null;
  }) as any);

  await userRepository.findById(20);

  assert.equal(queryArgs.include?.sesiones, undefined);
  assert.deepEqual(queryArgs.include, { alumno: true });
});

test('consultar usuario para autenticar selecciona solo los campos necesarios', async () => {
  let queryArgs: any;
  replaceMethod(prisma.usuario, 'findUnique', (async (args: any) => {
    queryArgs = args;
    return null;
  }) as any);

  await userRepository.findAuthById(20);

  assert.deepEqual(queryArgs.select, {
    idUsuario: true, email: true, dni: true, apellidoNombre: true, activo: true, rol: true
  });
});

test('consultar perfil selecciona datos públicos y ficha sin credenciales ni sesiones', async () => {
  let queryArgs: any;
  replaceMethod(prisma.usuario, 'findUnique', (async (args: any) => {
    queryArgs = args;
    return null;
  }) as any);

  await userRepository.findProfileById(20);

  assert.equal(queryArgs.select.alumno, true);
  assert.equal(queryArgs.include, undefined);
  assert.equal(queryArgs.select.passwordHash, undefined);
  assert.equal(queryArgs.select.backupCodes, undefined);
  assert.equal(queryArgs.select.sesiones, undefined);
});

test('select-role usa identidad sin cargar credenciales ni sesiones', async () => {
  const user = {
    idUsuario: 20, email: 'alumno@example.com', dni: 30111222,
    apellidoNombre: 'Alumno Seguro', activo: true, rol: 'ALUMNO,PROFESOR'
  };
  let authLookups = 0;
  let fullUserLookups = 0;
  replaceMethod(userRepository, 'findAuthById', (async () => {
    authLookups += 1;
    return user;
  }) as any);
  replaceMethod(userRepository, 'findById', (async () => {
    fullUserLookups += 1;
    return user;
  }) as any);
  replaceMethod(prisma.sesion, 'findUnique', (async () => ({
    id: 1, familiaId: 'familia-1', ipAddress: null, userAgent: null
  })) as any);
  replaceMethod(prisma.sesion, 'updateMany', (async () => ({ count: 1 })) as any);
  replaceMethod(prisma.sesion, 'create', (async () => ({ id: 2 })) as any);

  const result = await authService.selectRole(20, 'PROFESOR', 1);

  assert.equal(authLookups, 1);
  assert.equal(fullUserLookups, 0);
  assert.deepEqual(result.rolesDisponibles, ['ALUMNO', 'PROFESOR']);
});
