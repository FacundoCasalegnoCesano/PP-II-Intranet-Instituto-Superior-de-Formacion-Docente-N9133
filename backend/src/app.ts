import express from 'express';
import type { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import crypto from 'crypto';
import config from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/prisma.js';
import { pathToFileURL } from 'url';
import routes from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { sanitizeRequestPath } from './utils/requestPrivacy.js';

const app: Express = express();

// Nonce para CSP (inline scripts/styles permitidos solo con nonce)
app.use((req: Request, res: Response, next: NextFunction) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  next();
});

// Configuración de seguridad - Helmet endurecido en producción
const isProd = config.nodeEnv === 'production';

const cspDirectives = isProd
  ? ({
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", (req: any, res: any) => `'nonce-${res.locals?.nonce || ''}'`],
      styleSrc: ["'self'", (req: any, res: any) => `'nonce-${res.locals?.nonce || ''}'`],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    } as any)
  : false;

app.use(helmet({
  contentSecurityPolicy: cspDirectives,
  hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginEmbedderPolicy: isProd,
  crossOriginOpenerPolicy: isProd ? { policy: 'same-origin' } : false,
  crossOriginResourcePolicy: isProd ? { policy: 'same-site' } : false,
  xPoweredBy: false
}));

// Configuración de CORS
app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Middlewares de parseo
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging de peticiones (solo en desarrollo)
if (config.nodeEnv === 'development') {
  app.use((req: Request, res: Response, next: NextFunction) => {
    console.log(`${req.method} ${sanitizeRequestPath(req.path)} - ${req.ip}`);
    next();
  });
}

// Rutas de la API
app.use('/api', routes);

// Manejo de errores 404
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: `Ruta no encontrada: ${req.method} ${sanitizeRequestPath(req.path)}`
  });
});

// Middleware de manejo de errores
app.use(errorHandler);

// Iniciar servidor
const startServer = async () => {
  try {
    await connectDatabase();
    
    const server = app.listen(config.port, () => {
      console.log(`🚀 Server running on http://localhost:${config.port}`);
      console.log(`📚 API Documentation: http://localhost:${config.port}/api`);
      console.log(`🔧 Environment: ${config.nodeEnv}`);
      console.log(`🗄️  Database: MariaDB (${config.databaseName})`);
    });

    const gracefulShutdown = async () => {
      console.log('🛑 Recibida señal de cierre. Cerrando servidor...');
      server.close(async () => {
        console.log('Servidor HTTP cerrado');
        await disconnectDatabase();
        console.log('Conexión a base de datos cerrada');
        process.exit(0);
      });
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

    return server;
  } catch (error) {
    console.error('❌ Error al iniciar el servidor:', error);
    process.exit(1);
  }
};

// Solo iniciar si no estamos en modo test
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  startServer();
}

export { app, startServer };
