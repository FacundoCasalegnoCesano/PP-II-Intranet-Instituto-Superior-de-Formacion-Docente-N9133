import type { Request, Response, NextFunction } from 'express';
import homologacionService from '../services/homologacionService.js';
import { validationMiddleware } from '../middleware/validation.js';
import { ROLES } from '../constants/roles.js';

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
      const { estado, alumnoId } = req.query;
      const filters: { estado?: string; alumnoId?: number; page?: number; limit?: number } = {};
      if (estado && typeof estado === 'string') filters.estado = estado;
      if (alumnoId && typeof alumnoId === 'string') filters.alumnoId = parseInt(alumnoId);
      filters.page = req.query.page ? parseInt(req.query.page as string) : 1;
      filters.limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

      const solicitudes = await homologacionService.listar(filters);

      res.json({
        success: true,
        data: solicitudes.data,
        pagination: solicitudes.pagination
      });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/homologaciones/:id/nota-complementaria (Admin)
  async cargarNotaComplementaria(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id as string, 10);
      const { notaExamenHomologacion } = req.body as { notaExamenHomologacion: number };

      const homologacion = await homologacionService.cargarNotaComplementaria(id, notaExamenHomologacion);

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
      const id = parseInt(req.params.id as string, 10);
      const { accion } = req.body as { accion: 'APROBAR' | 'RECHAZAR' };

      const homologacion = await homologacionService.resolver(id, accion);

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
