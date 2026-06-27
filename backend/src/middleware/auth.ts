import type { Request, Response, NextFunction } from 'express';
import { verifyToken, extractTokenFromHeader } from '../utils/jwt.js';
import userRepository from '../repositories/userRepository.js';
import usuarioRolRepository from '../repositories/usuarioRolRepository.js';
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

export const authMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      res.status(401).json({
        success: false,
        message: 'No token provided'
      });
      return;
    }

    const decoded = verifyToken(token);
    
    // Verificar que el usuario existe y está activo
    const user = await userRepository.findById(decoded.id);
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Usuario no encontrado'
      });
      return;
    }

    if (!user.activo) {
      res.status(401).json({
        success: false,
        message: 'Usuario desactivado'
      });
      return;
    }

    // Verificar que la sesión existe y no está cerrada
    const session = await prisma.sesion.findFirst({
      where: {
        token,
        usuarioId: user.id,
        cerradaEn: null
      }
    });

    if (!session) {
      res.status(401).json({
        success: false,
        message: 'Sesión inválida o expirada'
      });
      return;
    }

    // Verificar que el token tiene un rol seleccionado
    if (!decoded.rol) {
      // Si no tiene rol, el usuario debe seleccionar uno
      const userRoles = await usuarioRolRepository.getRolesByUsuario(user.id);
      const roles = userRoles.map((ur: any) => ur.rol.nombre);
      
      res.status(403).json({
        success: false,
        message: 'Debes seleccionar un rol para continuar',
        code: 'ROLE_REQUIRED',
        rolesDisponibles: roles
      });
      return;
    }

    // Verificar que el rol seleccionado es válido para el usuario
    const userRol = await usuarioRolRepository.getRolesByNombre(user.id, decoded.rol);
    if (!userRol) {
      res.status(403).json({
        success: false,
        message: 'Rol no válido para este usuario'
      });
      return;
    }

    req.user = {
      id: user.id,
      email: user.email,
      dni: user.dni,
      rol: decoded.rol,
      nombre: user.apellidoNombre
    };
    req.sessionId = session.id;

    next();
  } catch (error) {
    if ((error as Error).message === 'Token expirado') {
      res.status(401).json({
        success: false,
        message: 'Token expirado',
        code: 'TOKEN_EXPIRED'
      });
      return;
    }
    res.status(401).json({
      success: false,
      message: (error as Error).message || 'Token inválido'
    });
  }
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