import type { Request, Response, NextFunction } from 'express';
import calificacionService from '../services/calificacionService.js';

class CalificacionController {
  // Carga masiva de notas por cursada (admin o profesor asignado)
  async cargarLote(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await calificacionService.cargarLote(req.body, req.user);
      res.status(201).json({
        success: true,
        message: `Calificaciones registradas (${result.registros})`,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  // Listado por cursada con filtros opcionales ?tipo= y ?alumnoId=
  async getByCursada(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const cursadaId = parseInt(req.params.cursadaId!);
      if (isNaN(cursadaId)) {
        res.status(400).json({ success: false, message: 'ID de cursada inválido' });
        return;
      }

      const filtros: { tipo?: string; alumnoId?: number } = {};
      if (req.query.tipo) filtros.tipo = req.query.tipo as string;
      if (req.query.alumnoId) filtros.alumnoId = parseInt(req.query.alumnoId as string);

      const data = await calificacionService.getByCursada(cursadaId, filtros, req.user);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // Historial de un alumno (el propio, admin o profesor)
  async getByAlumno(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const alumnoId = parseInt(req.params.alumnoId!);
      if (isNaN(alumnoId)) {
        res.status(400).json({ success: false, message: 'ID de alumno inválido' });
        return;
      }

      const data = await calificacionService.getByAlumno(alumnoId, req.user);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // Resumen con notas por tipo, promedio y cumplimiento de nota mínima
  async getResumenCursada(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const cursadaId = parseInt(req.params.cursadaId!);
      if (isNaN(cursadaId)) {
        res.status(400).json({ success: false, message: 'ID de cursada inválido' });
        return;
      }

      const data = await calificacionService.getResumenCursada(cursadaId, req.user);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // Mis calificaciones (alumno autenticado - read only)
  async getMisCalificaciones(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const alumnoId = req.user!.id;
      const data = await calificacionService.getByAlumno(alumnoId, req.user);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export default new CalificacionController();