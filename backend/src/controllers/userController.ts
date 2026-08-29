import type { Request, Response, NextFunction } from 'express';
import userService from '../services/userService.js';

class UserController {
  // Listar usuarios con filtros
  async listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters: Record<string, any> = {
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20
      };
      
      if (req.query.rol !== undefined) {
        filters.rol = req.query.rol as string;
      }
      if (req.query.activo !== undefined) {
        filters.activo = req.query.activo as string;
      }
      if (req.query.search !== undefined && req.query.search !== '') {
        filters.search = req.query.search as string;
      }
      
      const result = await userService.listUsers(filters);
      
      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    } catch (error) {
      next(error);
    }
  }

  // Obtener usuario por ID
  async getUserById(req: Request, res: Response, next: NextFunction): Promise<void> {
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
      
      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      next(error);
    }
  }

  // Actualizar usuario
  async updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
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

      const userData = req.body;
      const currentUser = req.user!;
      
      const updatedUser = await userService.updateUser(userId, userData, currentUser);
      
      res.json({
        success: true,
        message: 'Usuario actualizado exitosamente',
        data: updatedUser
      });
    } catch (error) {
      next(error);
    }
  }

  // Activar/Desactivar usuario
  async toggleUserActive(req: Request, res: Response, next: NextFunction): Promise<void> {
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

      const { active } = req.body;
      const currentUser = req.user!;
      
      if (active === undefined) {
        res.status(400).json({
          success: false,
          message: 'El campo "active" es requerido'
        });
        return;
      }
      
      const updatedUser = await userService.toggleUserActive(userId, active, currentUser);
      
      res.json({
        success: true,
        message: `Usuario ${active ? 'activado' : 'desactivado'} exitosamente`,
        data: updatedUser
      });
    } catch (error) {
      next(error);
    }
  }

  // Eliminar usuario
  async deleteUser(req: Request, res: Response, next: NextFunction): Promise<void> {
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

      const currentUser = req.user!;
      
      const result = await userService.deleteUser(userId, currentUser);
      
      res.json({
        success: true,
        message: result.message
      });
    } catch (error) {
      next(error);
    }
  }

  // Cambiar rol
  async changeUserRole(req: Request, res: Response, next: NextFunction): Promise<void> {
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

      const { rol } = req.body;
      const currentUser = req.user!;
      
      if (!rol) {
        res.status(400).json({
          success: false,
          message: 'El campo "rol" es requerido'
        });
        return;
      }
      
      const updatedUser = await userService.changeUserRole(userId, rol, currentUser);
      
      res.json({
        success: true,
        message: 'Rol actualizado exitosamente',
        data: updatedUser
      });
    } catch (error) {
      next(error);
    }
  }

  async removeUserRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = parseInt(req.params.id as string, 10);
      if (isNaN(userId)) {
        res.status(400).json({ success: false, message: 'ID de usuario inválido' });
        return;
      }

      const role = decodeURIComponent(req.params.rol as string);
      if (!role) {
        res.status(400).json({ success: false, message: 'El rol es requerido' });
        return;
      }

      const updatedUser = await userService.removeUserRole(userId, role, req.user!);
      res.json({
        success: true,
        message: 'Rol eliminado exitosamente',
        data: updatedUser
      });
    } catch (error) {
      next(error);
    }
  }
}

// ✅ Exportar la CLASE (NO una instancia)
export default UserController;
