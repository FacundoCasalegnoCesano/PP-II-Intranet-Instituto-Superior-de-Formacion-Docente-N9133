import assert from 'node:assert/strict';
import { test } from 'node:test';
import nodemailer from 'nodemailer';
import { buildPasswordResetEmail, getSmtpTransportOptions, sendEmail } from '../src/utils/email.js';

test('la plantilla de recuperación escapa el nombre y contiene el botón con el token', () => {
  const email = buildPasswordResetEmail('token-seguro', '<Ana & "Test">');

  assert.match(email.html, /href="http:\/\/localhost:5173\/restablecer-contrasena\?token=token-seguro"/);
  assert.match(email.html, /&lt;Ana &amp; &quot;Test&quot;&gt;/);
  assert.doesNotMatch(email.html, /<Ana & "Test">/);
  assert.match(email.text, /restablecer-contrasena\?token=token-seguro/);
});

test('Gmail SMTP usa SSL y nunca desactiva la validación TLS', () => {
  const options = getSmtpTransportOptions();

  assert.equal(options.host, 'smtp.gmail.com');
  assert.equal(options.port, 465);
  assert.equal(options.secure, true);
  assert.equal(options.auth.user, 'smtp-user@example.com');
  assert.equal(options.auth.pass, 'smtp-app-password');
  assert.equal((options as any).tls?.rejectUnauthorized, undefined);
});

test('un fallo SMTP no expone el mensaje del proveedor', async () => {
  const originalCreateTransport = nodemailer.createTransport;
  (nodemailer as any).createTransport = () => ({
    sendMail: async () => {
      const error = new Error('535 secret-provider-response');
      (error as any).code = 'EAUTH';
      throw error;
    }
  });

  try {
    await assert.rejects(
      sendEmail({ to: 'user@example.com', subject: 'test', html: '<p>test</p>', text: 'test' }),
      (error: Error) => error.message === 'No se pudo enviar el correo' && !error.message.includes('secret-provider-response')
    );
  } finally {
    (nodemailer as any).createTransport = originalCreateTransport;
  }
});
