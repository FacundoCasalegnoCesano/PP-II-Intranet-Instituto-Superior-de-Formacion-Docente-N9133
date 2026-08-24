import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateAccessToken, generateRefreshToken, verifyToken } from '../src/utils/jwt.js';

const payload = {
  id: 1,
  email: 'administracion@instituto.edu.ar',
  dni: '30123456',
  nombre: 'Administración Institucional',
  rol: 'ADMINISTRATIVO'
};

test('cada access token incluye un jti único aunque se genere en el mismo segundo', () => {
  const first = generateAccessToken(payload);
  const second = generateAccessToken(payload);

  assert.notEqual(first, second);
  assert.notEqual(verifyToken(first).jti, verifyToken(second).jti);
});

test('cada refresh token incluye un jti único aunque se genere en el mismo segundo', () => {
  const first = generateRefreshToken(payload);
  const second = generateRefreshToken(payload);

  assert.notEqual(first, second);
  assert.notEqual(verifyToken(first).jti, verifyToken(second).jti);
});
