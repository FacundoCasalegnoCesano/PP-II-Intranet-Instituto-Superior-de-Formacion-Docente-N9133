import type { Request, Response, NextFunction } from 'express';
import inscripcionCarreraService from '../services/inscripcionCarreraService.js';
import { ROLES } from '../constants/roles.js';

class InscripcionCarreraController {
  // Inscribir alumno a carrera (Alumno o Admin)
  async inscribirAlumno(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = req.body;
      const currentUser = req.user!;

      // Si el usuario es alumno, solo puede inscribirse a sí mismo
      if (currentUser.rol === ROLES.ALUMNO) {
        data.alumnoId = currentUser.id;
      }

      // Si es admin, puede inscribir a cualquier alumno
      // Si es otro rol, no puede inscribir

      const inscripcion = await inscripcionCarreraService.inscribirAlumno(data, currentUser);
      
      res.status(201).json({
        success: true,
        message: 'Alumno inscripto a la carrera exitosamente',
        data: inscripcion
      });
    } catch (error) {
      next(error);
    }
  }

  // Dar de baja de carrera (Alumno o Admin)
  async darBaja(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({
          success: false,
          message: 'ID de inscripción no proporcionado'
        });
        return;
      }

      const id = parseInt(idParam);
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de inscripción inválido'
        });
        return;
      }

      const currentUser = req.user!;
      const result = await inscripcionCarreraService.darBaja(id, currentUser);
      
      res.json({
        success: true,
        message: 'Baja de carrera realizada exitosamente',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  // Obtener carreras de un alumno (Alumno o Admin)
  async getCarrerasByAlumno(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.alumnoId;
      if (!idParam) {
        res.status(400).json({
          success: false,
          message: 'ID de alumno no proporcionado'
        });
        return;
      }

      const alumnoId = parseInt(idParam);
      if (isNaN(alumnoId)) {
        res.status(400).json({
          success: false,
          message: 'ID de alumno inválido'
        });
        return;
      }

      const currentUser = req.user!;
      const inscripciones = await inscripcionCarreraService.getInscripcionesByAlumno(alumnoId, currentUser);
      
      res.json({
        success: true,
        data: inscripciones
      });
    } catch (error) {
      next(error);
    }
  }

  // Obtener inscriptos por carrera (Admin)
  async getInscriptosByCarrera(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.carreraId;
      if (!idParam) {
        res.status(400).json({
          success: false,
          message: 'ID de carrera no proporcionado'
        });
        return;
      }

      const carreraId = parseInt(idParam);
      if (isNaN(carreraId)) {
        res.status(400).json({
          success: false,
          message: 'ID de carrera inválido'
        });
        return;
      }

      const inscriptos = await inscripcionCarreraService.getInscriptosByCarrera(carreraId);
      
      res.json({
        success: true,
        data: inscriptos
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new InscripcionCarreraController();