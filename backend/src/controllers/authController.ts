import type { Request, Response, NextFunction } from 'express';
import authService from '../services/authService.js';
import { prisma } from '../config/prisma.js';
import { validationMiddleware } from '../middleware/validation.js';

class AuthController {
// Registrar usuario (SOLO ADMIN)
async register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userData = req.body;
    // ✅ ELIMINAR currentUser - no se usa en el service
    const newUser = await authService.register(userData);
    
    res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente',
      data: newUser
    });
  } catch (error) {
    next(error);
  }
}

  // Login - retorna roles disponibles
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { identifier, password } = req.body;
      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const result = await authService.login(identifier, password, ipAddress, userAgent);
      
      res.json({
        success: true,
        message: 'Login exitoso',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  // Seleccionar rol para la sesión
  async selectRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { role } = req.body;
      const sessionId = req.sessionId!;
      const userId = req.user!.id;

      if (!role) {
        res.status(400).json({
          success: false,
          message: 'Rol es requerido'
        });
        return;
      }

      const result = await authService.selectRole(userId, role, sessionId);
      
      res.json({
        success: true,
        message: `Sesión iniciada como ${role}`,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  // Logout
  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sessionId = req.sessionId;
      if (!sessionId) {
        res.status(400).json({
          success: false,
          message: 'Sesión no válida'
        });
        return;
      }
      
      const result = await authService.logout(sessionId);
      
      res.json({
        success: true,
        message: 'Sesión cerrada exitosamente',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  // Refresh token
  async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        res.status(400).json({
          success: false,
          message: 'Refresh token es requerido'
        });
        return;
      }

      const result = await authService.refreshToken(refreshToken);
      
      res.json({
        success: true,
        message: 'Token renovado exitosamente',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  // Obtener perfil propio (con roles)
  async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const user = await authService.getProfile(userId);
      
      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      next(error);
    }
  }

  // Cambiar contraseña
  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const { currentPassword, newPassword } = req.body;
      
      const result = await authService.changePassword(userId, currentPassword, newPassword);
      
      // Invalidar TODA la familia de sesiones excepto la actual
      const session = await prisma.sesion.findUnique({ where: { id: req.sessionId! } });
      if (session) {
        await prisma.sesion.updateMany({
          where: {
            familiaId: session.familiaId,
            revocadaEn: null,
            id: { not: req.sessionId! }
          },
          data: {
            revocadaEn: new Date(),
            cerradaEn: new Date()
          }
        });
      }

      res.json({
        success: true,
        message: 'Contraseña actualizada exitosamente',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  // Forgot password
  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = req.body;
      const result = await authService.forgotPassword(email);

      res.json({
        success: true,
        message: result.message
      });
    } catch (error) {
      next(error);
    }
  }

  // Reset password
  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token, newPassword } = req.body;
      const result = await authService.resetPassword(token, newPassword);
      
      res.json({
        success: true,
        message: result.message
      });
    } catch (error) {
      next(error);
    }
  }

  // Verify reset token
  async verifyResetToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token } = req.params;
      
      if (!token) {
        res.status(400).json({
          success: false,
          message: 'Token es requerido'
        });
        return;
      }
      
      const result = await authService.verifyResetToken(token);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  // Recovery with backup code (admin only, público pero rate-limited)
  async recoveryWithBackupCode(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, code, newPassword } = req.body;
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      const result = await authService.recoveryWithBackupCode(email, code, newPassword, ip);

      res.json({
        success: true,
        message: `Contraseña restablecida. Códigos restantes: ${result.remainingCodes}`
      });
    } catch (error) {
      next(error);
    }
  }

  // Ver propios backup codes (requiere re-ingresar contraseña)
  async revealMyBackupCodes(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const { currentPassword } = req.body;
      const result = await authService.revealMyBackupCodes(userId, currentPassword);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  // Regenerar propios backup codes (invalida los anteriores)
  async regenerateMyBackupCodes(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const { currentPassword } = req.body;
      const result = await authService.regenerateMyBackupCodes(userId, currentPassword);

      res.json({
        success: true,
        message: 'Códigos regenerados. Los anteriores quedaron invalidados.',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new AuthController();
