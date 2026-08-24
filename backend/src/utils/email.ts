import nodemailer from 'nodemailer';
import config from '../config/env.js';

let transporter: nodemailer.Transporter | null = null;
let testAccount: nodemailer.TestAccount | null = null;

const createTransporter = async (): Promise<nodemailer.Transporter> => {
  if (transporter) return transporter;

  const isDev = config.nodeEnv === 'development';
  const hasSmtpConfig = config.smtpHost && config.smtpUser && config.smtpPass;

  if (isDev && !hasSmtpConfig) {
    // Development: Ethereal Email (fake SMTP for testing)
    testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });
    console.log('📧 [DEV] Ethereal Email configured');
    console.log(`📧 [DEV] Test account: ${testAccount.user}`);
    console.log(`📧 [DEV] Preview URLs: https://ethereal.email`);
  } else {
    // Production: Real SMTP
    transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465,
      auth: {
        user: config.smtpUser,
        pass: config.smtpPass
      },
      tls: {
        rejectUnauthorized: false
      }
    });
    console.log(`📧 [${config.nodeEnv.toUpperCase()}] SMTP configured: ${config.smtpHost}:${config.smtpPort}`);
  }

  return transporter;
};

export const getTestMessageUrl = (info: nodemailer.SentMessageInfo): string | null => {
  if (testAccount && info.messageId) {
    return `https://ethereal.email/message/${info.messageId.replace(/[<>]/g, '')}`;
  }
  return null;
};

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export const sendEmail = async ({ to, subject, html, text }: EmailOptions): Promise<nodemailer.SentMessageInfo> => {
  try {
    const transporter = await createTransporter();

    const mailOptions: nodemailer.SendMailOptions = {
      from: config.emailFrom,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, '')
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 Email sent: ${info.messageId}`);

    // Log preview URL in development
    const previewUrl = getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`📧 [DEV] Preview: ${previewUrl}`);
    }

    return info;
  } catch (error) {
    console.error('❌ Error sending email:', error);
    throw new Error(`Error al enviar email: ${(error as Error).message}`);
  }
};

export const sendPasswordResetEmail = async (email: string, resetToken: string, nombre: string): Promise<nodemailer.SentMessageInfo> => {
  const resetUrl = `${config.frontendUrl}/reset-password?token=${resetToken}`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .button { 
          display: inline-block; 
          padding: 12px 24px; 
          background-color: #4F46E5; 
          color: white; 
          text-decoration: none; 
          border-radius: 4px;
          margin: 20px 0;
        }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Recuperación de Contraseña</h1>
        </div>
        <div class="content">
          <p>Hola ${nombre},</p>
          <p>Hemos recibido una solicitud para restablecer tu contraseña. Si no realizaste esta solicitud, ignora este correo.</p>
          <p>Para restablecer tu contraseña, haz clic en el siguiente botón:</p>
          <div style="text-align: center;">
            <a href="${resetUrl}" class="button">Restablecer Contraseña</a>
          </div>
          <p>O copia y pega el siguiente enlace en tu navegador:</p>
          <p><a href="${resetUrl}">${resetUrl}</a></p>
          <p><strong>Este enlace expirará en 1 hora.</strong></p>
        </div>
        <div class="footer">
          <p>Este es un mensaje automático, por favor no respondas a este correo.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: 'Recuperación de Contraseña - Instituto',
    html
  });
};
