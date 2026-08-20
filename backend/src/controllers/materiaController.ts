import type { Request, Response, NextFunction } from 'express';
import materiaService from '../services/materiaService.js';

class MateriaController {
  async createMateria(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = req.body;
      const materia = await materiaService.createMateria(data);
      
      res.status(201).json({
        success: true,
        message: 'Materia creada exitosamente',
        data: materia
      });
    } catch (error) {
      next(error);
    }
  }

  async getMateriaById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({
          success: false,
          message: 'ID de materia no proporcionado'
        });
        return;
      }

      const id = parseInt(idParam);
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de materia inválido'
        });
        return;
      }

      const materia = await materiaService.getMateriaById(id);
      
      res.json({
        success: true,
        data: materia
      });
    } catch (error) {
      next(error);
    }
  }

  async listMaterias(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters: any = {
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 10
      };
      
      if (req.query.search) filters.search = req.query.search as string;
      if (req.query.carreraId) filters.carreraId = parseInt(req.query.carreraId as string);
      if (req.query.tipoEspacio) filters.tipoEspacio = req.query.tipoEspacio as string;
      if (req.query.activo !== undefined) filters.activo = req.query.activo === 'true';
      
      const result = await materiaService.listMaterias(filters);
      
      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    } catch (error) {
      next(error);
    }
  }

  async updateMateria(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({
          success: false,
          message: 'ID de materia no proporcionado'
        });
        return;
      }

      const id = parseInt(idParam);
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de materia inválido'
        });
        return;
      }

      const data = req.body;
      const materia = await materiaService.updateMateria(id, data);
      
      res.json({
        success: true,
        message: 'Materia actualizada exitosamente',
        data: materia
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteMateria(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({
          success: false,
          message: 'ID de materia no proporcionado'
        });
        return;
      }

      const id = parseInt(idParam);
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de materia inválido'
        });
        return;
      }

      await materiaService.deleteMateria(id);
      
      res.json({
        success: true,
        message: 'Materia eliminada exitosamente'
      });
    } catch (error) {
      next(error);
    }
  }

  async getMateriasByCarrera(req: Request, res: Response, next: NextFunction): Promise<void> {
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

      const materias = await materiaService.getMateriasByCarrera(carreraId);
      
      res.json({
        success: true,
        data: materias
      });
    } catch (error) {
      next(error);
    }
  }

  async getCorrelatividades(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({
          success: false,
          message: 'ID de materia no proporcionado'
        });
        return;
      }

      const id = parseInt(idParam);
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de materia inválido'
        });
        return;
      }

      const correlatividades = await materiaService.getCorrelatividades(id);
      
      res.json({
        success: true,
        data: correlatividades
      });
    } catch (error) {
      next(error);
    }
  }

  async addCorrelatividad(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({
          success: false,
          message: 'ID de materia no proporcionado'
        });
        return;
      }

      const id = parseInt(idParam);
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de materia inválido'
        });
        return;
      }

      const data = req.body;
      const correlatividad = await materiaService.addCorrelatividad({
        ...data,
        materiaOrigenId: id
      });
      
      res.status(201).json({
        success: true,
        message: 'Correlatividad agregada exitosamente',
        data: correlatividad
      });
    } catch (error) {
      next(error);
    }
  }

  async removeCorrelatividad(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({
          success: false,
          message: 'ID de correlatividad no proporcionado'
        });
        return;
      }

      const id = parseInt(idParam);
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de correlatividad inválido'
        });
        return;
      }

      await materiaService.removeCorrelatividad(id);
      
      res.json({
        success: true,
        message: 'Correlatividad eliminada exitosamente'
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new MateriaController();