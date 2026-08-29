import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const openapi = readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8');

test('OpenAPI conserva los contratos de autenticación consumidos por el frontend', () => {
  assert.match(openapi, /\/auth\/verify-reset-token\/\{token\}:[\s\S]*?name: token, in: path, required: true/);
  assert.match(openapi, /LoginResponse:[\s\S]*?accessToken:[\s\S]*?refreshToken:[\s\S]*?sessionId:/);
  assert.match(openapi, /SelectRoleResponse:[\s\S]*?accessToken:[\s\S]*?rolesDisponibles:/);
  assert.match(openapi, /RefreshTokenResponse:[\s\S]*?accessToken:[\s\S]*?refreshToken:/);
  assert.match(openapi, /MessageResponse:[\s\S]*?Envelope exitoso sin `data`/);
  assert.match(openapi, /VerifyResetTokenResponse:[\s\S]*?required: \[valid\]/);
  assert.match(openapi, /OwnProfileUpdateRequest:[\s\S]*?additionalProperties: false[\s\S]*?contactoEmergencia/);
  assert.match(openapi, /Cambiar contraseña propia y revocar las demás sesiones de su familia/);
});
