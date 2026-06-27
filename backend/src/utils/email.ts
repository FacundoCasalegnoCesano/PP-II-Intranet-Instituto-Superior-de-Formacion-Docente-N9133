import nodemailer from 'nodemailer';
import config from '../config/env.js';

let transporter: nodemailer.Transporter | null = null;

const createTransporter = (): nodemailer.Transporter => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.emailHost,
      port: config.emailPort,
      secure: config.emailPort === 465,
      auth: {
        user: config.emailUser,
        pass: config.emailPass
      },
      tls: {
        rejectUnauthorized: false
      }
    });
  }
  return transporter;
};

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export const sendEmail = async ({ to, subject, html, text }: EmailOptions): Promise<nodemailer.SentMessageInfo> => {
  try {
    const transporter = createTransporter();
    
    const mailOptions: nodemailer.SendMailOptions = {
      from: `"Sistema Instituto" <${config.emailUser}>`,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, '')
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 Email sent: ${info.messageId}`);
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