import type { Request, Response, NextFunction } from 'express';
import asistenciaService from '../services/asistenciaService.js';

class AsistenciaController {
  // Carga masiva de una clase (admin o profesor asignado)
  async cargarClase(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await asistenciaService.cargarClase(req.body, req.user);
      res.status(201).json({
        success: true,
        message: `Asistencias registradas (${result.registros} alumnos)`,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  // Listado por cursada, con filtro opcional ?fecha=
  async getByCursada(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const cursadaId = parseInt(req.params.cursadaId!);
      if (isNaN(cursadaId)) {
        res.status(400).json({ success: false, message: 'ID de cursada inválido' });
        return;
      }

      const data = await asistenciaService.getByCursada(
        cursadaId,
        req.query.fecha as string | undefined,
        req.user
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // Historial de un alumno
  async getByAlumno(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const alumnoId = parseInt(req.params.alumnoId!);
      if (isNaN(alumnoId)) {
        res.status(400).json({ success: false, message: 'ID de alumno inválido' });
        return;
      }

      const data = await asistenciaService.getByAlumno(alumnoId, req.user);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // Resumen con % de asistencia por alumno (define regularidad)
  async getResumenCursada(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const cursadaId = parseInt(req.params.cursadaId!);
      if (isNaN(cursadaId)) {
        res.status(400).json({ success: false, message: 'ID de cursada inválido' });
        return;
      }

      const data = await asistenciaService.getResumenCursada(cursadaId, req.user);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export default new AsistenciaController();