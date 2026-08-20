import type { Request, Response, NextFunction } from 'express';
import config from '../config/env.js';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction): void => {
  console.error('❌ Error:', {
    message: err.message,
    stack: config.nodeEnv === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
    body: req.body,
    query: req.query,
    params: req.params,
    user: req.user?.id
  });

  // Prisma errors
  if (err.code === 'P2002') {
    res.status(400).json({
      success: false,
      message: 'Ya existe un registro con ese valor único',
      field: err.meta?.target?.[0] || 'campo único'
    });
    return;
  }

  if (err.code === 'P2025') {
    res.status(404).json({
      success: false,
      message: 'Registro no encontrado'
    });
    return;
  }

  if (err.code === 'P2003') {
    res.status(400).json({
      success: false,
      message: 'Error de relación: el registro está siendo utilizado'
    });
    return;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError' || err.message === 'Token inválido') {
    res.status(401).json({
      success: false,
      message: 'Token inválido'
    });
    return;
  }

  if (err.message === 'Token expirado') {
    res.status(401).json({
      success: false,
      message: 'Token expirado',
      code: 'TOKEN_EXPIRED'
    });
    return;
  }

  // Generic error
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Error interno del servidor',
    ...(config.nodeEnv === 'development' && { stack: err.stack })
  });
};