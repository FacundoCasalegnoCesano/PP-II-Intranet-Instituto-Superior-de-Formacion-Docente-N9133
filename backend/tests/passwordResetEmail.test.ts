import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPasswordResetEmail } from '../src/utils/email.js';

test('el correo de recuperación entrega HTML y texto, escapa el nombre y codifica el token en query', () => {
  const content = buildPasswordResetEmail('ab+c/==&<token>', '<Ana & Pérez>');

  assert.match(content.html, /Hola &lt;Ana &amp; Pérez&gt;/);
  assert.match(content.html, /background:#74151A/);
  assert.match(content.html, /background:#8B151B/);
  assert.match(content.html, /restablecer-contrasena\?token=ab%2Bc%2F%3D%3D%26%3Ctoken%3E/);
  assert.match(content.text, /Hola <Ana & Pérez>,/);
  assert.match(content.text, /restablecer-contrasena\?token=ab%2Bc%2F%3D%3D%26%3Ctoken%3E/);
});
