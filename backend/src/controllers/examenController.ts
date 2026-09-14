import type { Request, Response, NextFunction } from 'express';
import examenService from '../services/examenService.js';
import { ROLES } from '../constants/roles.js';

class ExamenController {
  // ===== EXÁMENES =====
  async createExamen(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = req.body;
      const currentUser = req.user!;
      const examen = await examenService.createExamen(data, currentUser);
      
      res.status(201).json({
        success: true,
        message: 'Examen creado exitosamente',
        data: examen
      });
    } catch (error) {
      next(error);
    }
  }

  async getExamenById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({
          success: false,
          message: 'ID de examen no proporcionado'
        });
        return;
      }

      const id = parseInt(idParam);
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de examen inválido'
        });
        return;
      }

      const examen = await examenService.getExamenById(id, req.user!);
      
      res.json({
        success: true,
        data: examen
      });
    } catch (error) {
      next(error);
    }
  }

  async listExamenes(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters: any = {
        page: req.query.page ?? 1,
        limit: req.query.limit ?? 20,
        materiaId: req.query.materiaId,
        carreraId: req.query.carreraId,
        fechaDesde: req.query.fechaDesde,
        fechaHasta: req.query.fechaHasta,
        cicloLectivo: req.query.cicloLectivo,
        estadoMesa: req.query.estadoMesa
      };

      const result = await examenService.listExamenes(filters, req.user!);
      
      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    } catch (error) {
      next(error);
    }
  }

  async getMesasDisponibles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await examenService.getMesasDisponibles(req.user!);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async updateExamen(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({
          success: false,
          message: 'ID de examen no proporcionado'
        });
        return;
      }

      const id = parseInt(idParam);
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de examen inválido'
        });
        return;
      }

      const data = req.body;
      const currentUser = req.user!;
      const examen = await examenService.updateExamen(id, data, currentUser);
      
      res.json({
        success: true,
        message: 'Examen actualizado exitosamente',
        data: examen
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteExamen(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({
          success: false,
          message: 'ID de examen no proporcionado'
        });
        return;
      }

      const id = parseInt(idParam);
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de examen inválido'
        });
        return;
      }

      const currentUser = req.user!;
      await examenService.deleteExamen(id, currentUser);
      
      res.json({
        success: true,
        message: 'Examen eliminado exitosamente'
      });
    } catch (error) {
      next(error);
    }
  }

  // ===== TRIBUNALES =====
  async addTribunal(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = req.body;
      const currentUser = req.user!;
      const tribunal = await examenService.addTribunal(data, currentUser);
      
      res.status(201).json({
        success: true,
        message: 'Tribunal agregado exitosamente',
        data: tribunal
      });
    } catch (error) {
      next(error);
    }
  }

  async removeTribunal(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({
          success: false,
          message: 'ID de tribunal no proporcionado'
        });
        return;
      }

      const id = parseInt(idParam);
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de tribunal inválido'
        });
        return;
      }

      const currentUser = req.user!;
      const expectedVersion = req.query.expectedVersion as unknown as number | undefined;
      await examenService.removeTribunal(id, currentUser, expectedVersion);
      
      res.json({
        success: true,
        message: 'Tribunal eliminado exitosamente'
      });
    } catch (error) {
      next(error);
    }
  }

  // ===== INSCRIPCIÓN A EXÁMENES =====
  async inscribirAlumno(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.examenId;
      if (!idParam) {
        res.status(400).json({
          success: false,
          message: 'ID de examen no proporcionado'
        });
        return;
      }

      const examenId = parseInt(idParam);
      if (isNaN(examenId)) {
        res.status(400).json({
          success: false,
          message: 'ID de examen inválido'
        });
        return;
      }

      const { alumnoId, condicion, expectedVersion } = req.body;
      const currentUser = req.user!;

      // Si es alumno, usar su propio ID
      let finalAlumnoId = alumnoId;
      if (currentUser.rol === ROLES.ALUMNO) {
        finalAlumnoId = currentUser.id;
      }

      if (!finalAlumnoId) {
        res.status(400).json({
          success: false,
          message: 'ID de alumno no proporcionado'
        });
        return;
      }

      const inscripcion = await examenService.inscribirAlumno(
        examenId,
        finalAlumnoId,
        condicion || 'REGULAR',
        currentUser,
        expectedVersion
      );
      
      res.status(201).json({
        success: true,
        message: 'Alumno inscripto al examen exitosamente',
        data: inscripcion
      });
    } catch (error) {
      next(error);
    }
  }

  async desinscribirAlumno(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.examenId;
      if (!idParam) {
        res.status(400).json({
          success: false,
          message: 'ID de examen no proporcionado'
        });
        return;
      }

      const examenId = parseInt(idParam);
      if (isNaN(examenId)) {
        res.status(400).json({
          success: false,
          message: 'ID de examen inválido'
        });
        return;
      }

      const { alumnoId, expectedVersion } = req.body;
      const currentUser = req.user!;

      let finalAlumnoId = alumnoId;
      if (currentUser.rol === ROLES.ALUMNO) {
        finalAlumnoId = currentUser.id;
      }

      if (!finalAlumnoId) {
        res.status(400).json({
          success: false,
          message: 'ID de alumno no proporcionado'
        });
        return;
      }

      const result = await examenService.desinscribirAlumno(examenId, finalAlumnoId, currentUser, expectedVersion);
      
      res.json({
        success: true,
        message: 'Alumno desinscripto del examen exitosamente',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  async getInscriptosByExamen(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.examenId;
      if (!idParam) {
        res.status(400).json({
          success: false,
          message: 'ID de examen no proporcionado'
        });
        return;
      }

      const examenId = parseInt(idParam);
      if (isNaN(examenId)) {
        res.status(400).json({
          success: false,
          message: 'ID de examen inválido'
        });
        return;
      }

      const inscriptos = await examenService.getInscriptosByExamen(examenId, req.user!);
      
      res.json({
        success: true,
        data: inscriptos
      });
    } catch (error) {
      next(error);
    }
  }

  async getInscripcionesByAlumno(req: Request, res: Response, next: NextFunction): Promise<void> {
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
      const inscripciones = await examenService.getInscripcionesByAlumno(alumnoId, currentUser);
      
      res.json({
        success: true,
        data: inscripciones
      });
    } catch (error) {
      next(error);
    }
  }

  // ===== CALIFICACIONES =====
  async registrarNota(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.examenId;
      if (!idParam) {
        res.status(400).json({
          success: false,
          message: 'ID de examen no proporcionado'
        });
        return;
      }

      const examenId = parseInt(idParam);
      if (isNaN(examenId)) {
        res.status(400).json({
          success: false,
          message: 'ID de examen inválido'
        });
        return;
      }

      const { alumnoId, nota, ausente, expectedVersion } = req.body;
      const currentUser = req.user!;

      if (!alumnoId || (!ausente && nota === undefined)) {
        res.status(400).json({
          success: false,
          message: 'Alumno ID y nota son requeridos'
        });
        return;
      }

      const result = await examenService.registrarNota(
        examenId,
        alumnoId,
        ausente ? null : nota,
        currentUser,
        Boolean(ausente),
        expectedVersion
      );
      
      res.json({
        success: true,
        message: 'Nota registrada exitosamente',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  async cerrarMesa(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const examenId = Number(req.params.examenId);
      const result = await examenService.cerrarMesa(examenId, req.user!, req.body.expectedVersion);
      res.json({ success: true, message: 'Mesa cerrada y resultados publicados', data: result });
    } catch (error) {
      next(error);
    }
  }

  async reabrirMesa(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const examenId = Number(req.params.examenId);
      const result = await examenService.reabrirMesa(
        examenId,
        req.user!,
        req.body.motivo,
        req.body.expectedVersion
      );
      res.json({ success: true, message: 'Mesa reabierta para revisión', data: result });
    } catch (error) {
      next(error);
    }
  }
}

export default new ExamenController();
