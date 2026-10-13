import type { Request, Response, NextFunction } from 'express';
import { sanitizeRequestPath } from '../utils/requestPrivacy.js';
import { AppError } from '../utils/AppError.js';

const SENSITIVE_FIELDS = [
  'password', 'passwordHash', 'currentPassword', 'newPassword',
  'token', 'code', 'backupCode', 'resetToken',
  'authorization', 'cookie', 'session'
].map((field) => field.toLowerCase());

function sanitizeBody(body: any): any {
  if (!body || typeof body !== 'object') return body;
  const sanitized = { ...body };
  for (const key of Object.keys(sanitized)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_FIELDS.some(f => lowerKey.includes(f))) {
      sanitized[key] = '[REDACTED]';
    } else if (sanitized[key] && typeof sanitized[key] === 'object') {
      sanitized[key] = sanitizeBody(sanitized[key]);
    }
  }
  return sanitized;
}

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction): void => {
  const requestPath = req.route?.path
    ? `${req.baseUrl}${String(req.route.path)}`
    : sanitizeRequestPath(req.path);

  console.error('❌ Error:', {
    name: typeof err?.name === 'string' ? err.name : 'Error',
    code: typeof err?.code === 'string' ? err.code : undefined,
    path: requestPath,
    method: req.method,
    body: sanitizeBody(req.body),
    query: sanitizeBody(req.query),
    params: sanitizeBody(req.params),
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
