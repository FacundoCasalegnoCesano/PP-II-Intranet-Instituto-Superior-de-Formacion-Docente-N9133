import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import config from '../config/env.js';

export interface TokenPayload {
  id: number;
  email: string;
  dni: string;
  nombre: string;
  rol?: string; // ✅ Hacer opcional - para login sin rol
  type?: 'access' | 'refresh';
  familiaId?: string;
  jti?: string;
  exp?: number;
  iat?: number;
}

// Access token: 15 minutos
export const generateAccessToken = (payload: Omit<TokenPayload, 'type'>): string => {
  const { exp, iat, ...cleanPayload } = payload;
  return jwt.sign(
    { ...cleanPayload, type: 'access', jti: crypto.randomUUID() },
    config.jwtSecret,
    { expiresIn: '15m' } as any
  );
};

// Refresh token: 7 días
export const generateRefreshToken = (payload: Omit<TokenPayload, 'type'>): string => {
  const { exp, iat, ...cleanPayload } = payload;
  return jwt.sign(
    { ...cleanPayload, type: 'refresh', jti: crypto.randomUUID() },
    config.jwtSecret,
    { expiresIn: '7d' } as any
  );
};

// Hash del refresh token para almacenar en BD (sha256)
export const hashRefreshToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

export const verifyToken = (token: string): TokenPayload => {
  try {
    return jwt.verify(token, config.jwtSecret) as TokenPayload;
  } catch (error) {
    if ((error as Error).name === 'TokenExpiredError') {
      throw new Error('Token expirado');
    }
    if ((error as Error).name === 'JsonWebTokenError') {
      throw new Error('Token inválido');
    }
    throw new Error('Error al verificar token');
  }
};

export const verifyAccessToken = (token: string): TokenPayload => {
  const payload = verifyToken(token);
  if (payload.type !== 'access') {
    throw new Error('Tipo de token inválido');
  }
  return payload;
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  const payload = verifyToken(token);
  if (payload.type !== 'refresh') {
    throw new Error('Tipo de token inválido');
  }
  return payload;
};

export const decodeToken = (token: string): TokenPayload | null => {
  return jwt.decode(token) as TokenPayload | null;
};

export const extractTokenFromHeader = (authorization: string | undefined): string | null => {
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return null;
  }
  return authorization.substring(7);
};
