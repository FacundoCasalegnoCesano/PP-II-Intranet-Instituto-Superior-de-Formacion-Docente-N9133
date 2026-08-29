import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { generatePasswordResetToken, hashPasswordResetToken } from '../src/utils/passwordResetToken.js';

test('genera tokens de recuperación aleatorios y seguros para URL', () => {
  const first = generatePasswordResetToken();
  const second = generatePasswordResetToken();

  assert.equal(first.length, 43);
  assert.match(first, /^[A-Za-z0-9_-]+$/);
  assert.notEqual(first, second);
});

test('almacena el hash SHA-256 hexadecimal del token', () => {
  const token = 'token-de-prueba';
  const expected = crypto.createHash('sha256').update(token, 'utf8').digest('hex');

  assert.equal(hashPasswordResetToken(token), expected);
  assert.equal(hashPasswordResetToken(token).length, 64);
});
