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
  
  // Email
  emailHost: string;
  emailPort: number;
  emailUser: string;
  emailPass: string;
  
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
  
  // Email
  emailHost: process.env.EMAIL_HOST || '',
  emailPort: parseInt(process.env.EMAIL_PORT || '587'),
  emailUser: process.env.EMAIL_USER || '',
  emailPass: process.env.EMAIL_PASS || '',
  
  // URLs
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  backendUrl: process.env.BACKEND_URL || 'http://localhost:3000'
};

// Validar variables críticas
if (!config.jwtSecret) {
  throw new Error('JWT_SECRET no está definido en las variables de entorno');
}

export default config;