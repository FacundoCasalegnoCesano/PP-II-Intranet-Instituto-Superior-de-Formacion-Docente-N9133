import type { Request, Response, NextFunction } from 'express';
// ✅ Importar la CLASE
import UserController from './userController.js';
import userService from '../services/userService.js';
import { ROLES } from '../constants/roles.js';

class AlumnoController extends UserController {
  // Listar solo alumnos
  async listarAlumnos(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      req.query.rol = ROLES.ALUMNO as string;
      await super.listUsers(req, res, next);
    } catch (error) {
      next(error);
    }
  }

  // Obtener un alumno específico
  async obtenerAlumno(req: Request, res: Response, next: NextFunction): Promise<void> {
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
      
      if (!user || !user.roles.includes(ROLES.ALUMNO)) {
        res.status(404).json({
          success: false,
          message: 'El usuario no es un alumno o no existe'
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

  // Crear un alumno
  async crearAlumno(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      req.body.rol = ROLES.ALUMNO;
      const { default: authController } = await import('./authController.js');
      await authController.register(req, res, next);
    } catch (error) {
      next(error);
    }
  }

  // Actualizar un alumno
  async actualizarAlumno(req: Request, res: Response, next: NextFunction): Promise<void> {
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
      if (!user || !user.roles.includes(ROLES.ALUMNO)) {
        res.status(404).json({
          success: false,
          message: 'El usuario no es un alumno o no existe'
        });
        return;
      }
      
      await super.updateUser(req, res, next);
    } catch (error) {
      next(error);
    }
  }

  // Eliminar un alumno
  async eliminarAlumno(req: Request, res: Response, next: NextFunction): Promise<void> {
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
      if (!user || !user.roles.includes(ROLES.ALUMNO)) {
        res.status(404).json({
          success: false,
          message: 'El usuario no es un alumno o no existe'
        });
        return;
      }
      
      await super.deleteUser(req, res, next);
    } catch (error) {
      next(error);
    }
  }

  // Estadísticas de alumnos
  async estadisticasAlumnos(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { prisma } = await import('../config/prisma.js');
      
      const [total, activos, inactivos] = await Promise.all([
        prisma.usuario.count({ where: { roles: { some: { rol: ROLES.ALUMNO } } } }),
                prisma.usuario.count({ where: { roles: { some: { rol: ROLES.ALUMNO, activo: true } } } }),
                prisma.usuario.count({ where: { roles: { some: { rol: ROLES.ALUMNO, activo: false } } } })
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
export default new AlumnoController();