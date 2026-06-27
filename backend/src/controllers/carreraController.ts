import type { Request, Response, NextFunction } from 'express';
import carreraService from '../services/carreraService.js';

class CarreraController {
  async createCarrera(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = req.body;
      const carrera = await carreraService.createCarrera(data);
      
      res.status(201).json({
        success: true,
        message: 'Carrera creada exitosamente',
        data: carrera
      });
    } catch (error) {
      next(error);
    }
  }

  async getCarreraById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({
          success: false,
          message: 'ID de carrera no proporcionado'
        });
        return;
      }

      const id = parseInt(idParam);
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de carrera inválido'
        });
        return;
      }

      const carrera = await carreraService.getCarreraById(id);
      
      res.json({
        success: true,
        data: carrera
      });
    } catch (error) {
      next(error);
    }
  }

  async listCarreras(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters: any = {
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 10
      };
      
      if (req.query.search) filters.search = req.query.search as string;
      if (req.query.activo !== undefined) filters.activo = req.query.activo === 'true';
      
      const result = await carreraService.listCarreras(filters);
      
      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    } catch (error) {
      next(error);
    }
  }

  async updateCarrera(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({
          success: false,
          message: 'ID de carrera no proporcionado'
        });
        return;
      }

      const id = parseInt(idParam);
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de carrera inválido'
        });
        return;
      }

      const data = req.body;
      const carrera = await carreraService.updateCarrera(id, data);
      
      res.json({
        success: true,
        message: 'Carrera actualizada exitosamente',
        data: carrera
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteCarrera(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({
          success: false,
          message: 'ID de carrera no proporcionado'
        });
        return;
      }

      const id = parseInt(idParam);
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de carrera inválido'
        });
        return;
      }

      await carreraService.deleteCarrera(id);
      
      res.json({
        success: true,
        message: 'Carrera eliminada exitosamente'
      });
    } catch (error) {
      next(error);
    }
  }

  async getPlanEstudio(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({
          success: false,
          message: 'ID de carrera no proporcionado'
        });
        return;
      }

      const id = parseInt(idParam);
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de carrera inválido'
        });
        return;
      }

      const plan = await carreraService.getPlanEstudio(id);
      
      res.json({
        success: true,
        data: plan
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new CarreraController();