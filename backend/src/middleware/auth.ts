import type { Request, Response, NextFunction } from 'express';
import { verifyToken, extractTokenFromHeader } from '../utils/jwt.js';
import userRepository from '../repositories/userRepository.js';
import { prisma } from '../config/prisma.js';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        email: string;
        dni: string;
        rol: string;
        nombre: string;
      };
      sessionId?: number;
    }
  }
}

// Autenticación pura: valida token, usuario activo y sesión activa.
// Setea req.user y req.sessionId. NO exige que el token tenga rol.
// Retorna true si el request puede continuar; false si ya se respondió.
async function authenticateRequest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<boolean> {
  try {
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      res.status(401).json({
        success: false,
        message: 'No token provided'
      });
      return false;
    }

    const decoded = verifyToken(token);

    // Verificar que el usuario existe y está activo
    const user = await userRepository.findById(decoded.id);
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Usuario no encontrado'
      });
      return false;
    }

    if (!user.activo) {
      res.status(401).json({
        success: false,
        message: 'Usuario desactivado'
      });
      return false;
    }

    // Verificar que la sesión existe y no está cerrada
    const session = await prisma.sesion.findFirst({
      where: {
        token,
        usuarioId: user.idUsuario,
        cerradaEn: null
      }
    });

    if (!session) {
      res.status(401).json({
        success: false,
        message: 'Sesión inválida o expirada'
      });
      return false;
    }

    req.user = {
      id: user.idUsuario,
      email: user.email,
      dni: user.dni.toString(),
      rol: decoded.rol || '',
      nombre: user.apellidoNombre
    };
    req.sessionId = session.id;

    return true;
  } catch (error) {
    if ((error as Error).message === 'Token expirado') {
      res.status(401).json({
        success: false,
        message: 'Token expirado',
        code: 'TOKEN_EXPIRED'
      });
    } else {
      res.status(401).json({
        success: false,
        message: (error as Error).message || 'Token inválido'
      });
    }
    return false;
  }
}

// Solo autentica (token + usuario + sesión), sin exigir rol.
// Útil para flujos tipo "select-role" donde el token aún no tiene rol.
export const authOnly = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const ok = await authenticateRequest(req, res, next);
  if (ok) {
    next();
  }
};

// Autentica Y exige que el token tenga un rol válido.
export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const ok = await authenticateRequest(req, res, next);
  if (!ok) {
    return;
  }

  // Si el token no tiene rol, el usuario debe seleccionar uno
  if (!req.user!.rol) {
    const user = await userRepository.findById(req.user!.id);
    const userRoles = user?.rol ? user.rol.split(',').map((r: string) => r.trim()) : [];
    res.status(403).json({
      success: false,
      message: 'Debes seleccionar un rol para continuar',
      code: 'ROLE_REQUIRED',
      rolesDisponibles: userRoles
    });
    return;
  }

  next();
};

export const roleCheck = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
      return;
    }

    if (!roles.includes(req.user.rol)) {
      res.status(403).json({
        success: false,
        message: `Acceso denegado. Se requiere uno de los siguientes roles: ${roles.join(', ')}`
      });
      return;
    }

    next();
  };
};