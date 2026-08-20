import jwt from 'jsonwebtoken';
import config from '../config/env.js';

export interface TokenPayload {
  id: number;
  email: string;
  dni: string;
  nombre: string;
  rol?: string; // ✅ Hacer opcional - para login sin rol
  type?: string;
  exp?: number;
  iat?: number;
}

export const generateToken = (payload: TokenPayload): string => {
  const { exp, iat, ...cleanPayload } = payload;
  
  // Usar 'as any' para evitar problemas de tipos estrictos
  return jwt.sign(
    cleanPayload,
    config.jwtSecret,
    { expiresIn: config.jwtExpire || '7d' } as any
  );
};

export const generateRefreshToken = (payload: TokenPayload): string => {
  const { exp, iat, ...cleanPayload } = payload;
  
  return jwt.sign(
    cleanPayload,
    config.jwtSecret,
    { expiresIn: config.jwtRefreshExpire || '30d' } as any
  );
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

export const decodeToken = (token: string): TokenPayload | null => {
  return jwt.decode(token) as TokenPayload | null;
};

export const extractTokenFromHeader = (authorization: string | undefined): string | null => {
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return null;
  }
  return authorization.substring(7);
};