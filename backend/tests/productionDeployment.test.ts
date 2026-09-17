import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const validAdminEnvironment = {
  ADMIN_NAME: 'Administración Instituto',
  ADMIN_DNI: '30123456',
  ADMIN_EMAIL: 'ADMIN@EXAMPLE.COM',
  ADMIN_BIRTH_DATE: '1985-05-20',
  ADMIN_PHONE: '3415551234',
  ADMIN_PASSWORD: 'ClaveSegura1!',
  ADMIN_CUIL: '20301234567'
};

test('produccion confia solamente en el primer proxy de Railway', async () => {
  process.env.NODE_ENV = 'production';
  process.env.JWT_SECRET = 'test-jwt-secret-with-enough-entropy';
  process.env.GMAIL_CLIENT_ID = 'test-client-id';
  process.env.GMAIL_CLIENT_SECRET = 'test-client-secret';
  process.env.GMAIL_REFRESH_TOKEN = 'test-refresh-token';
  process.env.EMAIL_FROM = 'Instituto <test@example.test>';

  const { app } = await import('../src/app.js');

  assert.equal(app.get('trust proxy'), 1);
});

test('el bootstrap administrativo obtiene la identidad de variables y no registra secretos', async () => {
  const source = await readFile(new URL('../src/scripts/createAdmin.ts', import.meta.url), 'utf8');

  for (const variable of [
    'ADMIN_NAME',
    'ADMIN_DNI',
    'ADMIN_EMAIL',
    'ADMIN_BIRTH_DATE',
    'ADMIN_PHONE',
    'ADMIN_PASSWORD',
    'ADMIN_CUIL'
  ]) {
    assert.match(source, new RegExp(variable), `falta utilizar ${variable}`);
  }

  assert.doesNotMatch(source, /Admin123!/);
  assert.doesNotMatch(source, /admin@instituto\.edu\.ar/);
  assert.doesNotMatch(source, /Contrase(?:ñ|n)a[^\n]*console|console\.log\([^\n]*password/i);
  assert.doesNotMatch(source, /printBackupCodes/);
});

test('el bootstrap rechaza variables administrativas incompletas', async () => {
  const { readAdminBootstrapData } = await import('../src/scripts/createAdmin.js');
  const environment = { ...validAdminEnvironment };
  delete (environment as Partial<typeof validAdminEnvironment>).ADMIN_PASSWORD;

  assert.throws(
    () => readAdminBootstrapData(environment),
    /ADMIN_PASSWORD/
  );
});

test('el bootstrap valida y normaliza los datos administrativos', async () => {
  const { readAdminBootstrapData } = await import('../src/scripts/createAdmin.js');
  const data = readAdminBootstrapData(validAdminEnvironment);

  assert.equal(data.dni, 30123456);
  assert.equal(data.email, 'admin@example.com');
  assert.ok(data.fechaNacimiento instanceof Date);
  assert.equal(data.contactoEmergencia, null);
});
