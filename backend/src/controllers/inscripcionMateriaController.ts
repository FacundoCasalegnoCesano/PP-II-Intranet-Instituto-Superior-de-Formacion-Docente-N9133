import type { Request, Response, NextFunction } from 'express';
import inscripcionMateriaService from '../services/inscripcionMateriaService.js';
import materiaService from '../services/materiaService.js';
import { ROLES } from '../constants/roles.js';

class InscripcionMateriaController {
  // Inscribir alumno a materia (Alumno o Admin)
  async inscribirAlumno(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = req.body;
      const currentUser = req.user!;

      // Si el usuario es alumno, solo puede inscribirse a sí mismo
      if (currentUser.rol === ROLES.ALUMNO) {
        data.alumnoId = currentUser.id;
      }

      const inscripcion = await inscripcionMateriaService.inscribirAlumno(data, currentUser);
      
      res.status(201).json({
        success: true,
        message: 'Alumno inscripto a la materia exitosamente',
        data: inscripcion
      });
    } catch (error) {
      next(error);
    }
  }

  // Dar de baja de materia (Alumno o Admin)
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
      const result = await inscripcionMateriaService.darBaja(id, currentUser);
      
      res.json({
        success: true,
        message: 'Baja de materia realizada exitosamente',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  // Obtener materias de un alumno (Alumno o Admin)
  async getMateriasByAlumno(req: Request, res: Response, next: NextFunction): Promise<void> {
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
      const inscripciones = await inscripcionMateriaService.getInscripcionesByAlumno(alumnoId, currentUser, {
        page: Number(req.query.page ?? 1), limit: Number(req.query.limit ?? 20)
      });
      
      res.json({
        success: true,
        data: inscripciones.data,
        pagination: inscripciones.pagination
      });
    } catch (error) {
      next(error);
    }
  }

  // Obtener inscriptos por materia (Admin)
  async getInscriptosByMateria(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.materiaId;
      if (!idParam) {
        res.status(400).json({
          success: false,
          message: 'ID de materia no proporcionado'
        });
        return;
      }

      const materiaId = parseInt(idParam);
      if (isNaN(materiaId)) {
        res.status(400).json({
          success: false,
          message: 'ID de materia inválido'
        });
        return;
      }

      const inscriptos = await inscripcionMateriaService.getInscriptosByMateria(materiaId, {
        page: Number(req.query.page ?? 1), limit: Number(req.query.limit ?? 20)
      }, req.user!);
      
      res.json({
        success: true,
        data: inscriptos.data,
        pagination: inscriptos.pagination
      });
    } catch (error) {
      next(error);
    }
  }

  // Obtener historial de un alumno en una materia (Alumno o Admin)
  async getHistorialAlumnoMateria(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const alumnoIdParam = req.params.alumnoId;
      const materiaIdParam = req.params.materiaId;

      if (!alumnoIdParam || !materiaIdParam) {
        res.status(400).json({
          success: false,
          message: 'IDs no proporcionados'
        });
        return;
      }

      const alumnoId = parseInt(alumnoIdParam);
      const materiaId = parseInt(materiaIdParam);

      if (isNaN(alumnoId) || isNaN(materiaId)) {
        res.status(400).json({
          success: false,
          message: 'IDs inválidos'
        });
        return;
      }

      const currentUser = req.user!;
      
      if (currentUser.rol !== ROLES.ADMINISTRATIVO && currentUser.id !== alumnoId) {
        res.status(403).json({
          success: false,
          message: 'No tienes permisos para ver este historial'
        });
        return;
      }

      const historial = await inscripcionMateriaService.getHistorialAlumnoMateria(alumnoId, materiaId);
      
      res.json({
        success: true,
        data: historial
      });
    } catch (error) {
      next(error);
    }
  }

  // Cambiar modalidad de cursada (Admin)
  async cambiarModalidad(req: Request, res: Response, next: NextFunction): Promise<void> {
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

      const { modalidadElegida } = req.body;
      if (!modalidadElegida) {
        res.status(400).json({
          success: false,
          message: 'Modalidad es requerida'
        });
        return;
      }

      const currentUser = req.user!;
      const result = await inscripcionMateriaService.cambiarModalidad(id, modalidadElegida, currentUser);
      
      res.json({
        success: true,
        message: 'Modalidad actualizada exitosamente',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  // ============================================
  // NUEVOS MÉTODOS PARA MATERIAS DISPONIBLES
  // ============================================

  // Obtener materias disponibles para el alumno (con horarios)
  async getMateriasDisponibles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const currentUser = req.user!;
      let alumnoId: number;
      
      if (currentUser.rol === ROLES.ADMINISTRATIVO) {
        const alumnoIdParam = req.query.alumnoId as string;
        if (!alumnoIdParam) {
          res.status(400).json({
            success: false,
            message: 'Para administradores, debe especificar alumnoId'
          });
          return;
        }
        alumnoId = parseInt(alumnoIdParam);
        if (isNaN(alumnoId)) {
          res.status(400).json({
            success: false,
            message: 'ID de alumno inválido'
          });
          return;
        }
      } else {
        alumnoId = currentUser.id;
      }

      const cicloLectivo = req.query.cicloLectivo 
        ? parseInt(req.query.cicloLectivo as string) 
        : new Date().getFullYear();

      const materias = await materiaService.getMateriasDisponibles(alumnoId, cicloLectivo);
      
      res.json({
        success: true,
        data: materias
      });
    } catch (error) {
      next(error);
    }
  }

  // Verificar si el alumno puede inscribirse a una materia
  async verificarInscripcion(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const materiaIdParam = req.params.materiaId;
      if (!materiaIdParam) {
        res.status(400).json({
          success: false,
          message: 'ID de materia no proporcionado'
        });
        return;
      }

      const materiaId = parseInt(materiaIdParam);
      if (isNaN(materiaId)) {
        res.status(400).json({
          success: false,
          message: 'ID de materia inválido'
        });
        return;
      }

      const currentUser = req.user!;
      let alumnoId: number;
      
      if (currentUser.rol === ROLES.ADMINISTRATIVO) {
        const alumnoIdParam = req.query.alumnoId as string;
        if (!alumnoIdParam) {
          res.status(400).json({
            success: false,
            message: 'Para administradores, debe especificar alumnoId'
          });
          return;
        }
        alumnoId = parseInt(alumnoIdParam);
        if (isNaN(alumnoId)) {
          res.status(400).json({
            success: false,
            message: 'ID de alumno inválido'
          });
          return;
        }
      } else {
        alumnoId = currentUser.id;
      }

      const cicloLectivo = req.query.cicloLectivo 
        ? parseInt(req.query.cicloLectivo as string) 
        : new Date().getFullYear();

      const result = await materiaService.verificarInscripcion(
        alumnoId,
        materiaId,
        cicloLectivo
      );
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new InscripcionMateriaController();
