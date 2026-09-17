import assert from 'node:assert/strict';
import { test } from 'node:test';
import config from '../src/config/env.js';
import { buildPasswordResetEmail, sendEmail } from '../src/utils/email.js';

test('la plantilla de recuperación escapa el nombre y contiene el botón con el token', () => {
  const email = buildPasswordResetEmail('token-seguro', '<Ana & "Test">');

  assert.match(email.html, /href="http:\/\/localhost:5173\/restablecer-contrasena\?token=token-seguro"/);
  assert.match(email.html, /&lt;Ana &amp; &quot;Test&quot;&gt;/);
  assert.doesNotMatch(email.html, /<Ana & "Test">/);
  assert.match(email.text, /restablecer-contrasena\?token=token-seguro/);
});

test('Gmail API usa OAuth y envía MIME RFC2822 como base64url', async () => {
  const originalFetch = globalThis.fetch;
  const originalConfig = {
    gmailClientId: config.gmailClientId,
    gmailClientSecret: config.gmailClientSecret,
    gmailRefreshToken: config.gmailRefreshToken,
    emailFrom: config.emailFrom
  };
  let sendRequest: { headers?: HeadersInit; body?: BodyInit | null } | undefined;

  Object.assign(config, {
    gmailClientId: 'client-id-test',
    gmailClientSecret: 'client-secret-test',
    gmailRefreshToken: 'refresh-token-test',
    emailFrom: 'Instituto <sender@example.com>'
  });
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith('/token')) {
      return new Response(JSON.stringify({ access_token: 'access-token-test' }), { status: 200 });
    }
    sendRequest = { headers: init?.headers, body: init?.body };
    return new Response(JSON.stringify({ id: 'message-id-test' }), { status: 200 });
  };

  try {
    await sendEmail({ to: 'user@example.com', subject: 'Asunto de prueba', html: '<p>HTML de prueba</p>', text: 'Texto de prueba' });
    assert.equal(new Headers(sendRequest?.headers).get('authorization'), 'Bearer access-token-test');
    const raw = Buffer.from(String((sendRequest?.body as string) && JSON.parse(String(sendRequest?.body)).raw), 'base64url').toString('utf8');
    assert.match(raw, /Subject: Asunto de prueba/);
    assert.match(raw, /HTML de prueba/);
    assert.match(raw, /Texto de prueba/);
  } finally {
    globalThis.fetch = originalFetch;
    Object.assign(config, originalConfig);
  }
});

test('Gmail API ausente no se intenta y no expone secretos', async () => {
  const originalFetch = globalThis.fetch;
  const originalConfig = {
    gmailClientId: config.gmailClientId,
    gmailClientSecret: config.gmailClientSecret,
    gmailRefreshToken: config.gmailRefreshToken,
    emailFrom: config.emailFrom
  };
  let fetchCalls = 0;
  Object.assign(config, { gmailClientId: '', gmailClientSecret: '', gmailRefreshToken: '', emailFrom: '' });
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('no debe realizarse una llamada externa');
  };

  try {
    await assert.rejects(
      sendEmail({ to: 'user@example.com', subject: 'test', html: '<p>test</p>', text: 'test' }),
      (error: Error) => error.message === 'No se pudo enviar el correo'
    );
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    Object.assign(config, originalConfig);
  }
});
