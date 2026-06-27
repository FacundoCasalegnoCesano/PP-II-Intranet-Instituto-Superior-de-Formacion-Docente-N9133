import type { Request, Response, NextFunction } from 'express';
// ✅ Importar la CLASE
import UserController from './userController.js';
import userService from '../services/userService.js';
import { ROLES } from '../constants/roles.js';

class AdministrativoController extends UserController {
  // Listar solo administrativos
  async listarAdministrativos(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      req.query.rol = ROLES.ADMINISTRATIVO as string;
      await super.listUsers(req, res, next);
    } catch (error) {
      next(error);
    }
  }

  // Obtener un administrativo específico
  async obtenerAdministrativo(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({
          success: false,
          message: 'ID de usuario no proporcionado'
        });
        return;
      }

      const userId = parseInt(idParam);
      if (isNaN(userId)) {
        res.status(400).json({
          success: false,
          message: 'ID de usuario inválido'
        });
        return;
      }

      const user = await userService.getUserById(userId);
      
      if (!user || user.rol !== ROLES.ADMINISTRATIVO) {
        res.status(404).json({
          success: false,
          message: 'El usuario no es un administrativo o no existe'
        });
        return;
      }
      
      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      next(error);
    }
  }

  // Crear un administrativo
  async crearAdministrativo(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      req.body.rol = ROLES.ADMINISTRATIVO;
      const { default: authController } = await import('./authController.js');
      await authController.register(req, res, next);
    } catch (error) {
      next(error);
    }
  }

  // Actualizar un administrativo
  async actualizarAdministrativo(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({
          success: false,
          message: 'ID de usuario no proporcionado'
        });
        return;
      }

      const userId = parseInt(idParam);
      if (isNaN(userId)) {
        res.status(400).json({
          success: false,
          message: 'ID de usuario inválido'
        });
        return;
      }
      
      const user = await userService.getUserById(userId);
      if (!user || user.rol !== ROLES.ADMINISTRATIVO) {
        res.status(404).json({
          success: false,
          message: 'El usuario no es un administrativo o no existe'
        });
        return;
      }
      
      await super.updateUser(req, res, next);
    } catch (error) {
      next(error);
    }
  }

  // Eliminar un administrativo
  async eliminarAdministrativo(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({
          success: false,
          message: 'ID de usuario no proporcionado'
        });
        return;
      }

      const userId = parseInt(idParam);
      if (isNaN(userId)) {
        res.status(400).json({
          success: false,
          message: 'ID de usuario inválido'
        });
        return;
      }
      
      const user = await userService.getUserById(userId);
      if (!user || user.rol !== ROLES.ADMINISTRATIVO) {
        res.status(404).json({
          success: false,
          message: 'El usuario no es un administrativo o no existe'
        });
        return;
      }
      
      await super.deleteUser(req, res, next);
    } catch (error) {
      next(error);
    }
  }

  // Estadísticas de administrativos
  async estadisticasAdministrativos(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { prisma } = await import('../config/prisma.js');
      
      const [total, activos, inactivos] = await Promise.all([
        prisma.usuario.count({ where: { rol: ROLES.ADMINISTRATIVO } }),
        prisma.usuario.count({ where: { rol: ROLES.ADMINISTRATIVO, activo: true } }),
        prisma.usuario.count({ where: { rol: ROLES.ADMINISTRATIVO, activo: false } })
      ]);
      
      res.json({
        success: true,
        data: { total, activos, inactivos }
      });
    } catch (error) {
      next(error);
    }
  }
}

// ✅ Exportar INSTANCIA para usar en rutas
export default new AdministrativoController();