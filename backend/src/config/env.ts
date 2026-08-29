import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables de entorno
dotenv.config({ path: path.join(__dirname, '../../.env') });

export interface Config {
  // App
  port: number;
  nodeEnv: string;
  
  // Database
  databaseHost: string;
  databasePort: number;
  databaseUser: string;
  databasePassword: string;
  databaseName: string;
  
  // JWT
  jwtSecret: string;
  jwtExpire: string;
  jwtRefreshExpire: string;
  
  // Email (SMTP)
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  emailFrom: string;
  
  // URLs
  frontendUrl: string;
  backendUrl: string;
}

const config: Config = {
  // App
  port: parseInt(process.env.PORT || '3000'),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database
  databaseHost: process.env.DATABASE_HOST || 'localhost',
  databasePort: parseInt(process.env.DATABASE_PORT || '3306'),
  databaseUser: process.env.DATABASE_USER || 'root',
  databasePassword: process.env.DATABASE_PASSWORD || '',
  databaseName: process.env.DATABASE_NAME || 'instituto_db',
  
  // JWT
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpire: process.env.JWT_EXPIRE || '7d',
  jwtRefreshExpire: process.env.JWT_REFRESH_EXPIRE || '30d',
  
  // Email (SMTP)
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: parseInt(process.env.SMTP_PORT || '587'),
  smtpSecure: process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE.toLowerCase() === 'true'
    : parseInt(process.env.SMTP_PORT || '587') === 465,
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  emailFrom: process.env.EMAIL_FROM || 'Instituto <noreply@instituto.edu.ar>',
  
  // URLs
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  backendUrl: process.env.BACKEND_URL || 'http://localhost:3000'
};

// Validar variables críticas
if (!config.jwtSecret) {
  throw new Error('JWT_SECRET no está definido en las variables de entorno');
}

if (config.nodeEnv === 'production' && (!config.smtpHost || !config.smtpPort || !config.smtpUser || !config.smtpPass || !config.emailFrom)) {
  throw new Error('La configuración SMTP es obligatoria en producción');
}

export default config;
