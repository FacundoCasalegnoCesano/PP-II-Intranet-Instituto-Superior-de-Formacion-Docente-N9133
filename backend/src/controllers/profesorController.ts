import type { Request, Response, NextFunction } from 'express';
// ✅ Importar la CLASE
import UserController from './userController.js';
import userService from '../services/userService.js';
import { ROLES } from '../constants/roles.js';

class ProfesorController extends UserController {
  // Listar solo profesores
  async listarProfesores(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      req.query.rol = ROLES.PROFESOR as string;
      await super.listUsers(req, res, next);
    } catch (error) {
      next(error);
    }
  }

  // Obtener un profesor específico
  async obtenerProfesor(req: Request, res: Response, next: NextFunction): Promise<void> {
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
      
      if (!user || !user.roles.includes(ROLES.PROFESOR)) {
        res.status(404).json({
          success: false,
          message: 'El usuario no es un profesor o no existe'
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

  // Crear un profesor
  async crearProfesor(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      req.body.rol = ROLES.PROFESOR;
      const { default: authController } = await import('./authController.js');
      await authController.register(req, res, next);
    } catch (error) {
      next(error);
    }
  }

  // Actualizar un profesor
  async actualizarProfesor(req: Request, res: Response, next: NextFunction): Promise<void> {
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
      if (!user || !user.roles.includes(ROLES.PROFESOR)) {
        res.status(404).json({
          success: false,
          message: 'El usuario no es un profesor o no existe'
        });
        return;
      }
      
      await super.updateUser(req, res, next);
    } catch (error) {
      next(error);
    }
  }

  // Eliminar un profesor
  async eliminarProfesor(req: Request, res: Response, next: NextFunction): Promise<void> {
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
      if (!user || !user.roles.includes(ROLES.PROFESOR)) {
        res.status(404).json({
          success: false,
          message: 'El usuario no es un profesor o no existe'
        });
        return;
      }
      
      await super.deleteUser(req, res, next);
    } catch (error) {
      next(error);
    }
  }

  // Estadísticas de profesores
  async estadisticasProfesores(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { prisma } = await import('../config/prisma.js');
      
      const [total, activos, inactivos] = await Promise.all([
        prisma.usuario.count({ where: { roles: { some: { rol: ROLES.PROFESOR } } } }),
                prisma.usuario.count({ where: { roles: { some: { rol: ROLES.PROFESOR, activo: true } } } }),
                prisma.usuario.count({ where: { roles: { some: { rol: ROLES.PROFESOR, activo: false } } } })
      ]);
      
      res.json({
        success: true,
        data: { total, activos, inactivos }
      });
    } catch (error) {
      next(error);
    }
  }

  // Métodos específicos para profesores
  async obtenerMateriasAsignadas(req: Request, res: Response, next: NextFunction): Promise<void> {
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
      
      const { prisma } = await import('../config/prisma.js');
      const materias = await prisma.profesorMateria.findMany({
        where: {
          profesorId: userId,
          activo: true
        },
        include: {
          materia: true
        }
      });
      
      res.json({
        success: true,
        data: materias
      });
    } catch (error) {
      next(error);
    }
  }
}

// ✅ Exportar INSTANCIA para usar en rutas
export default new ProfesorController();