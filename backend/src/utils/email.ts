import type nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import config from '../config/env.js';

export interface PasswordResetEmail {
  html: string;
  text: string;
}

export const escapeHtml = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const GMAIL_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const REQUEST_TIMEOUT_MS = 10_000;

const assertConfigured = (): void => {
  if (!config.gmailClientId || !config.gmailClientSecret || !config.gmailRefreshToken || !config.emailFrom) {
    throw new Error('GMAIL_API_NOT_CONFIGURED');
  }
};

const encodeForm = (values: Record<string, string>): string => new URLSearchParams(values).toString();

const readJson = async (response: Response): Promise<unknown> => {
  const body = await response.text();
  if (!response.ok) throw new Error('GMAIL_API_ERROR');
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Error('GMAIL_API_INVALID_RESPONSE');
  }
};

const fetchJson = async (url: string, init: RequestInit): Promise<unknown> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return await readJson(response);
  } finally {
    clearTimeout(timeout);
  }
};

const getAccessToken = async (): Promise<string> => {
  assertConfigured();
  const result = await fetchJson(GMAIL_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: encodeForm({
      client_id: config.gmailClientId,
      client_secret: config.gmailClientSecret,
      refresh_token: config.gmailRefreshToken,
      grant_type: 'refresh_token'
    })
  });
  if (!result || typeof result !== 'object' || typeof (result as { access_token?: unknown }).access_token !== 'string'
    || !(result as { access_token: string }).access_token.trim()) {
    throw new Error('GMAIL_API_INVALID_RESPONSE');
  }
  return (result as { access_token: string }).access_token;
};

const rejectHeaderInjection = (value: string): void => {
  if (/[\r\n]/.test(value)) throw new Error('INVALID_EMAIL_HEADER');
};

const buildRawMessage = async ({ to, subject, html, text }: EmailOptions): Promise<string> => {
  rejectHeaderInjection(config.emailFrom);
  rejectHeaderInjection(to);
  rejectHeaderInjection(subject);
  const rawMessage = await new MailComposer({
    from: config.emailFrom,
    to,
    subject,
    text,
    html,
    disableFileAccess: true,
    disableUrlAccess: true
  })
    .compile()
    .build();
  return rawMessage.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
};

export const sendEmail = async ({ to, subject, html, text }: EmailOptions): Promise<nodemailer.SentMessageInfo> => {
  try {
    const accessToken = await getAccessToken();
    const result = await fetchJson(GMAIL_SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw: await buildRawMessage({ to, subject, html, text }) })
    });
    if (!result || typeof result !== 'object' || typeof (result as { id?: unknown }).id !== 'string'
      || !(result as { id: string }).id.trim()) {
      throw new Error('GMAIL_API_INVALID_RESPONSE');
    }
    return { accepted: [to], rejected: [], messageId: (result as { id: string }).id };
  } catch (error) {
    console.error('Email delivery failed', {
      code: error instanceof Error && /^(GMAIL_API_|INVALID_EMAIL_HEADER)/.test(error.message)
        ? error.message
        : 'EMAIL_DELIVERY_ERROR'
    });
    throw new Error('No se pudo enviar el correo');
  }
};

export const buildPasswordResetEmail = (resetToken: string, nombre: string): PasswordResetEmail => {
  const safeName = escapeHtml(nombre);
  const resetUrl = `${config.frontendUrl}/restablecer-contrasena?token=${encodeURIComponent(resetToken)}`;
  const safeResetUrl = escapeHtml(resetUrl);
  const text = [
    `Hola ${nombre},`,
    '',
    'Hemos recibido una solicitud para restablecer tu contraseña. Si no realizaste esta solicitud, ignora este correo.',
    '',
    `Restablece tu contraseña desde este enlace: ${resetUrl}`,
    '',
    'Este enlace expirará en 1 hora.'
  ].join('\n');
  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="UTF-8"><title>Recuperación de contraseña</title></head>
    <body style="font-family:Arial,sans-serif;line-height:1.6">
      <div style="max-width:600px;margin:0 auto;padding:20px">
        <div style="background:#74151A;color:#fff;padding:20px;text-align:center">
          <h1>Recuperación de contraseña</h1>
        </div>
        <div style="padding:20px;background:#f9f9f9">
          <p>Hola ${safeName},</p>
          <p>Hemos recibido una solicitud para restablecer tu contraseña. Si no realizaste esta solicitud, ignora este correo.</p>
          <p style="text-align:center"><a href="${safeResetUrl}" style="display:inline-block;padding:12px 24px;background:#8B151B;color:#fff;text-decoration:none;border-radius:4px">Restablecer contraseña</a></p>
          <p>Este enlace expirará en 1 hora.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return { html, text };
};

export const sendPasswordResetEmail = async (email: string, resetToken: string, nombre: string): Promise<nodemailer.SentMessageInfo> => {
  const content = buildPasswordResetEmail(resetToken, nombre);
  return sendEmail({
    to: email,
    subject: 'Recuperación de contraseña - Instituto',
    ...content
  });
};
