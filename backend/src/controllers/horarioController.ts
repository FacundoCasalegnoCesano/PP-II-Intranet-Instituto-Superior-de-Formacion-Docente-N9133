import type { Request, Response, NextFunction } from 'express';
import horarioService from '../services/horarioService.js';

class HorarioController {
  async crearHorario(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = req.body;
      const currentUser = req.user!;
      const horario = await horarioService.crearHorario(data, currentUser);
      
      res.status(201).json({
        success: true,
        message: 'Horario creado exitosamente',
        data: horario
      });
    } catch (error) {
      next(error);
    }
  }

  async getHorarioById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({
          success: false,
          message: 'ID de horario no proporcionado'
        });
        return;
      }

      const id = parseInt(idParam);
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de horario inválido'
        });
        return;
      }

      const horario = await horarioService.getHorarioById(id);
      
      res.json({
        success: true,
        data: horario
      });
    } catch (error) {
      next(error);
    }
  }

  async getHorariosByCursada(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.cursadaId;
      if (!idParam) {
        res.status(400).json({
          success: false,
          message: 'ID de cursada no proporcionado'
        });
        return;
      }

      const cursadaId = parseInt(idParam);
      if (isNaN(cursadaId)) {
        res.status(400).json({
          success: false,
          message: 'ID de cursada inválido'
        });
        return;
      }

      const horarios = await horarioService.getHorariosByCursada(cursadaId);
      
      res.json({
        success: true,
        data: horarios
      });
    } catch (error) {
      next(error);
    }
  }

  async getHorariosByMateria(req: Request, res: Response, next: NextFunction): Promise<void> {
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

      const horarios = await horarioService.getHorariosByMateria(materiaId);
      
      res.json({
        success: true,
        data: horarios
      });
    } catch (error) {
      next(error);
    }
  }

  async updateHorario(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({
          success: false,
          message: 'ID de horario no proporcionado'
        });
        return;
      }

      const id = parseInt(idParam);
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de horario inválido'
        });
        return;
      }

      const data = req.body;
      const currentUser = req.user!;
      const horario = await horarioService.updateHorario(id, data, currentUser);
      
      res.json({
        success: true,
        message: 'Horario actualizado exitosamente',
        data: horario
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteHorario(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({
          success: false,
          message: 'ID de horario no proporcionado'
        });
        return;
      }

      const id = parseInt(idParam);
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de horario inválido'
        });
        return;
      }

      const currentUser = req.user!;
      await horarioService.deleteHorario(id, currentUser);
      
      res.json({
        success: true,
        message: 'Horario eliminado exitosamente'
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new HorarioController();