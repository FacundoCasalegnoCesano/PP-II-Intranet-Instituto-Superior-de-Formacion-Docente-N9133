import type { Request, Response, NextFunction } from 'express';
import { sanitizeRequestPath } from '../utils/requestPrivacy.js';
import { AppError } from '../utils/AppError.js';

const SAFE_ERROR_NAMES = new Set([
  'Error', 'AppError', 'PrismaClientKnownRequestError', 'JsonWebTokenError', 'TokenExpiredError'
]);
const SAFE_ERROR_CODES = new Set(['P2002', 'P2025', 'P2003']);

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction): void => {
  const requestPath = req.route?.path
    ? `${req.baseUrl}${String(req.route.path)}`
    : sanitizeRequestPath(req.path);
  const errorName = SAFE_ERROR_NAMES.has(err?.name) ? err.name : 'Error';
  const errorCode = SAFE_ERROR_CODES.has(err?.code) ? err.code : undefined;

  console.error('❌ Error:', {
    name: errorName,
    code: errorCode,
    path: requestPath,
    method: req.method,
    user: req.user?.id
  });

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ success: false, message: err.message });
    return;
  }

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

  res.status(500).json({ success: false, message: 'Error interno del servidor' });
};
