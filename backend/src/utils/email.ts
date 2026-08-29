import nodemailer from 'nodemailer';
import config from '../config/env.js';

let transporter: nodemailer.Transporter | null = null;

export interface SmtpTransportOptions {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

export interface PasswordResetEmail {
  html: string;
  text: string;
}

export const getSmtpTransportOptions = (): SmtpTransportOptions => ({
  host: config.smtpHost,
  port: config.smtpPort,
  secure: config.smtpSecure,
  auth: {
    user: config.smtpUser,
    pass: config.smtpPass
  }
});

const createTransporter = (): nodemailer.Transporter => {
  if (transporter) return transporter;

  const options = getSmtpTransportOptions();
  if (!options.host || !options.port || !options.auth.user || !options.auth.pass) {
    throw new Error('SMTP no está configurado');
  }

  transporter = nodemailer.createTransport(options);
  console.log(`📧 [${config.nodeEnv.toUpperCase()}] SMTP configurado: ${options.host}:${options.port}`);
  return transporter;
};

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

export const sendEmail = async ({ to, subject, html, text }: EmailOptions): Promise<nodemailer.SentMessageInfo> => {
  try {
    const mailTransporter = createTransporter();
    return await mailTransporter.sendMail({
      from: config.emailFrom,
      to,
      subject,
      html,
      text
    });
  } catch (error) {
    const errorCode = typeof (error as { code?: unknown })?.code === 'string'
      ? (error as { code: string }).code
      : 'SMTP_ERROR';
    console.error('Email delivery failed', { errorCode });
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
