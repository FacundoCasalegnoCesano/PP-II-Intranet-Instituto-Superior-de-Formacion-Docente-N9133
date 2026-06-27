import express from 'express';
import type { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import config from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/prisma.js';
import routes from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';

const app: Express = express();

// Configuración de seguridad
app.use(helmet());

// Configuración de CORS
app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Limitador de peticiones
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    message: 'Demasiadas peticiones desde esta IP, por favor intenta de nuevo en 15 minutos'
  }
});
app.use('/api', limiter);

// Middlewares de parseo
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging de peticiones (solo en desarrollo)
if (config.nodeEnv === 'development') {
  app.use((req: Request, res: Response, next: NextFunction) => {
    console.log(`${req.method} ${req.path} - ${req.ip}`);
    next();
  });
}

// Rutas de la API
app.use('/api', routes);

// Manejo de errores 404
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: `Ruta no encontrada: ${req.method} ${req.path}`
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
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}

export { app, startServer };