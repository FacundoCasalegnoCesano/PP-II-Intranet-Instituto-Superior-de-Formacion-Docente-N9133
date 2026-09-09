import type { Request, Response, NextFunction } from 'express';
import estadoAcademicoService from '../services/estadoAcademicoService.js';

class EstadoAcademicoController {
  async getPorCursada(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const cursadaId = parseInt(req.params.cursadaId!);
      if (isNaN(cursadaId)) {
        res.status(400).json({ success: false, message: 'ID de cursada inválido' });
        return;
      }

      const data = await estadoAcademicoService.getResumenPorCursada(cursadaId, req.user);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async getTrayectoriaIntegral(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const alumnoId = parseInt(req.params.alumnoId!);
      const carreraId = parseInt(req.query.carreraId as string);
      if (isNaN(alumnoId) || isNaN(carreraId)) {
        res.status(400).json({ success: false, message: 'alumnoId y carreraId son requeridos y deben ser numéricos' });
        return;
      }
      const data = await estadoAcademicoService.getTrayectoriaIntegral(alumnoId, carreraId, req.user);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // Estados de todos los alumnos de una materia (admin o profesor asignado)
  async getPorMateria(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const materiaId = parseInt(req.params.materiaId!);
      if (isNaN(materiaId)) {
        res.status(400).json({ success: false, message: 'ID de materia inválido' });
        return;
      }

      const cicloLectivo = req.query.cicloLectivo
        ? parseInt(req.query.cicloLectivo as string)
        : undefined;

      const data = await estadoAcademicoService.getResumenPorMateria(
        materiaId,
        req.user,
        cicloLectivo
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // Estado académico completo de un alumno (el propio si es ALUMNO)
  async getPorAlumno(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const alumnoId = parseInt(req.params.alumnoId!);
      if (isNaN(alumnoId)) {
        res.status(400).json({ success: false, message: 'ID de alumno inválido' });
        return;
      }

      const data = await estadoAcademicoService.getEstadoAlumno(alumnoId, req.user);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  // Art. 61 RAI: promedio general de la carrera del alumno
  async getPromedioGeneral(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const alumnoId = parseInt(req.params.alumnoId!);
      if (isNaN(alumnoId)) {
        res.status(400).json({ success: false, message: 'ID de alumno inválido' });
        return;
      }

      const carreraId = req.query.carreraId
        ? parseInt(req.query.carreraId as string)
        : undefined;

      const data = await estadoAcademicoService.getPromedioGeneral(
        alumnoId,
        req.user,
        carreraId
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export default new EstadoAcademicoController();
