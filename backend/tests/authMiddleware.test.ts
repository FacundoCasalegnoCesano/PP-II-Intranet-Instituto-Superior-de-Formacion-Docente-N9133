import assert from 'node:assert/strict';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';
import { prisma } from '../src/config/prisma.js';
import config from '../src/config/env.js';
import userRepository from '../src/repositories/userRepository.js';
import { authMiddleware, authOnly } from '../src/middleware/auth.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { generateAccessToken, generateRefreshToken } from '../src/utils/jwt.js';

const userRecord = {
  idUsuario: 41,
  email: 'test@example.test',
  dni: 12345678,
  apellidoNombre: 'Usuario de prueba',
  activo: true,
  rol: 'ADMINISTRATIVO'
};

function replaceMethod(target: Record<string, unknown>, key: string, replacement: unknown): () => void {
  const original = target[key];
  target[key] = replacement;
  return () => { target[key] = original; };
}

async function invokeMiddleware(token: string | undefined, middleware = authMiddleware) {
  const req: any = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    path: '/api/private',
    method: 'GET',
    body: {},
    query: {},
    params: {}
  };
  let statusCode = 0;
  let payload: unknown;
  let nextCalls = 0;
  const res: any = {
    status: (status: number) => { statusCode = status; return res; },
    json: (body: unknown) => { payload = body; return res; }
  };
  const logs: unknown[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => logs.push(args);

  try {
    await middleware(req, res, (error?: unknown) => {
      nextCalls += 1;
      if (error) errorHandler(error, req, res, () => undefined);
    });
  } finally {
    console.error = originalError;
  }

  return { statusCode, payload, nextCalls, logs };
}

function signedAccessToken(rol?: string): string {
  return generateAccessToken({
    id: userRecord.idUsuario,
    email: userRecord.email,
    dni: String(userRecord.dni),
    nombre: userRecord.apellidoNombre,
    ...(rol ? { rol } : {})
  });
}

test('las fallas al leer usuario y sesión pasan al manejador común con respuesta genérica', async () => {
  const marker = 'DB_SECRET_AUTH_MARKER';
  const token = signedAccessToken('ADMINISTRATIVO');
  const restoreUser = replaceMethod(userRepository as any, 'findAuthById', async () => {
    throw new Error(marker);
  });
  const restoreSession = replaceMethod(prisma.sesion as any, 'findFirst', async () => ({ id: 9 }));

  try {
    const userFailure = await invokeMiddleware(token);
    assert.equal(userFailure.statusCode, 500);
    assert.deepEqual(userFailure.payload, { success: false, message: 'Error interno del servidor' });
    assert.equal(userFailure.nextCalls, 1);
    assert.doesNotMatch(JSON.stringify(userFailure.payload), new RegExp(marker));

    restoreUser();
    const restoreUserForSessionFailure = replaceMethod(userRepository as any, 'findAuthById', async () => ({ ...userRecord }));
    const restoreSessionFailure = replaceMethod(prisma.sesion as any, 'findFirst', async () => {
      throw new Error(marker);
    });
    try {
      const sessionFailure = await invokeMiddleware(token);
      assert.equal(sessionFailure.statusCode, 500);
      assert.deepEqual(sessionFailure.payload, { success: false, message: 'Error interno del servidor' });
      assert.equal(sessionFailure.nextCalls, 1);
      assert.doesNotMatch(JSON.stringify(sessionFailure.payload), new RegExp(marker));
    } finally {
      restoreSessionFailure();
      restoreUserForSessionFailure();
    }
  } finally {
    restoreSession();
    restoreUser();
  }
});

test('la segunda lectura del usuario sin rol propaga el error al manejador común', async () => {
  const marker = 'DB_SECRET_ROLE_LOOKUP_MARKER';
  let userReads = 0;
  const restoreUser = replaceMethod(userRepository as any, 'findAuthById', async () => {
    userReads += 1;
    if (userReads === 1) return { ...userRecord, rol: '' };
    throw new Error(marker);
  });
  const restoreSession = replaceMethod(prisma.sesion as any, 'findFirst', async () => ({ id: 9 }));

  try {
    const result = await invokeMiddleware(signedAccessToken());
    assert.equal(userReads, 2);
    assert.equal(result.statusCode, 500);
    assert.deepEqual(result.payload, { success: false, message: 'Error interno del servidor' });
    assert.equal(result.nextCalls, 1);
    assert.doesNotMatch(JSON.stringify(result.payload), new RegExp(marker));
  } finally {
    restoreSession();
    restoreUser();
  }
});

test('conserva 401 para ausencia, JWT inválido, expirado, tipo incorrecto y sesión revocada', async () => {
  const restoreUser = replaceMethod(userRepository as any, 'findAuthById', async () => ({ ...userRecord }));
  let session: { id: number } | null = { id: 9 };
  const restoreSession = replaceMethod(prisma.sesion as any, 'findFirst', async () => session);

  try {
    const missing = await invokeMiddleware(undefined);
    assert.equal(missing.statusCode, 401);
    assert.equal(missing.nextCalls, 0);

    const invalid = await invokeMiddleware('not-a-jwt');
    assert.equal(invalid.statusCode, 401);
    assert.deepEqual(invalid.payload, { success: false, message: 'Token inválido' });

    const expired = jwt.sign({ id: userRecord.idUsuario, type: 'access', exp: Math.floor(Date.now() / 1000) - 1 }, config.jwtSecret);
    const expiredResult = await invokeMiddleware(expired);
    assert.equal(expiredResult.statusCode, 401);
    assert.deepEqual(expiredResult.payload, { success: false, message: 'Token expirado', code: 'TOKEN_EXPIRED' });

    const wrongType = await invokeMiddleware(generateRefreshToken({
      id: userRecord.idUsuario,
      email: userRecord.email,
      dni: String(userRecord.dni),
      nombre: userRecord.apellidoNombre
    }));
    assert.equal(wrongType.statusCode, 401);
    assert.deepEqual(wrongType.payload, { success: false, message: 'Tipo de token inválido' });

    session = null;
    const revoked = await invokeMiddleware(signedAccessToken('ADMINISTRATIVO'));
    assert.equal(revoked.statusCode, 401);
    assert.deepEqual(revoked.payload, { success: false, message: 'Sesión inválida o expirada' });

    session = { id: 9 };
    const authenticated = await invokeMiddleware(signedAccessToken('ADMINISTRATIVO'));
    assert.equal(authenticated.statusCode, 0);
    assert.equal(authenticated.nextCalls, 1);
  } finally {
    restoreSession();
    restoreUser();
  }
});

test('conserva 401 para usuario inactivo y 403 ROLE_REQUIRED para token sin rol', async () => {
  const restoreUser = replaceMethod(userRepository as any, 'findAuthById', async () => ({ ...userRecord }));
  const restoreSession = replaceMethod(prisma.sesion as any, 'findFirst', async () => ({ id: 9 }));

  try {
    const inactiveRestore = replaceMethod(userRepository as any, 'findAuthById', async () => ({ ...userRecord, activo: false }));
    const inactive = await invokeMiddleware(signedAccessToken('ADMINISTRATIVO'));
    assert.equal(inactive.statusCode, 401);
    assert.deepEqual(inactive.payload, { success: false, message: 'Usuario desactivado' });
    inactiveRestore();

    const roleRequired = await invokeMiddleware(signedAccessToken());
    assert.equal(roleRequired.statusCode, 403);
    assert.deepEqual(roleRequired.payload, {
      success: false,
      message: 'Debes seleccionar un rol para continuar',
      code: 'ROLE_REQUIRED',
      rolesDisponibles: ['ADMINISTRATIVO']
    });

    const authOnlyResult = await invokeMiddleware(signedAccessToken(), authOnly);
    assert.equal(authOnlyResult.statusCode, 0);
    assert.equal(authOnlyResult.nextCalls, 1);

    const authOnlyRestore = replaceMethod(userRepository as any, 'findAuthById', async () => {
      throw new Error('DB_SECRET_AUTH_ONLY_MARKER');
    });
    try {
      const authOnlyFailure = await invokeMiddleware(signedAccessToken(), authOnly);
      assert.equal(authOnlyFailure.statusCode, 500);
      assert.deepEqual(authOnlyFailure.payload, { success: false, message: 'Error interno del servidor' });
      assert.equal(authOnlyFailure.nextCalls, 1);
    } finally {
      authOnlyRestore();
    }
  } finally {
    restoreSession();
    restoreUser();
  }
});
