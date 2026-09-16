import type { Request, Response, NextFunction } from 'express';
import homologacionService from '../services/homologacionService.js';
import { validationMiddleware } from '../middleware/validation.js';
import { ROLES } from '../constants/roles.js';
import { AppError } from '../utils/AppError.js';

class HomologacionController {
  // POST /api/homologaciones (Admin crea solicitud)
  async crear(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = req.body;
      const currentUser = req.user!;
      const homologacion = await homologacionService.crearSolicitud(data, currentUser);

      res.status(201).json({
        success: true,
        message: 'Solicitud de homologación creada exitosamente',
        data: homologacion
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/homologaciones/mis-solicitudes (Alumno)
  async getMisSolicitudes(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const alumnoId = req.user!.id;
      const solicitudes = await homologacionService.getMisSolicitudes(alumnoId);

      res.json({
        success: true,
        data: solicitudes
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/homologaciones (Admin con filtros)
  async listar(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const solicitudes = await homologacionService.listar(req.query as any, req.user!);

      res.json({
        success: true,
        data: solicitudes.data,
        pagination: solicitudes.pagination
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/homologaciones/:id (Admin)
  async obtener(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id < 1) {
        throw new AppError(400, 'ID de homologación inválido');
      }
      const homologacion = await homologacionService.obtener(id, req.user!);
      res.json({ success: true, data: homologacion });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/homologaciones/:id/nota-complementaria (Admin)
  async cargarNotaComplementaria(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id < 1) {
        throw new AppError(400, 'ID de homologación inválido');
      }
      const { notaExamenHomologacion } = req.body as { notaExamenHomologacion: number };

      const homologacion = await homologacionService.cargarNotaComplementaria(id, notaExamenHomologacion, req.user!);

      res.json({
        success: true,
        message: 'Nota de examen complementario registrada',
        data: homologacion
      });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/homologaciones/:id/resolver (Admin)
  async resolver(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id < 1) {
        throw new AppError(400, 'ID de homologación inválido');
      }
      const { accion } = req.body as { accion: 'APROBAR' | 'RECHAZAR' };

      const homologacion = await homologacionService.resolver(id, accion, req.user!);

      res.json({
        success: true,
        message: accion === 'APROBAR' ? 'Solicitud aprobada' : 'Solicitud rechazada',
        data: homologacion
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new HomologacionController();
