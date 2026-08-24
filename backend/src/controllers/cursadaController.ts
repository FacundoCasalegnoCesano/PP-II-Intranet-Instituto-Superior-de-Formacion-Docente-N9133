import type { Request, Response, NextFunction } from 'express';
import cursadaService from '../services/cursadaService.js';

function parseId(req: Request, res: Response, nombre: string = 'ID'): number | null {
  const value = parseInt(req.params.id as string);
  if (isNaN(value)) {
    res.status(400).json({
      success: false,
      message: `${nombre} inválido`
    });
    return null;
  }
  return value;
}

class CursadaController {
  async createCursada(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const cursada = await cursadaService.createCursada(req.body, req.user!);
      res.status(201).json({
        success: true,
        message: 'Cursada creada exitosamente',
        data: cursada
      });
    } catch (error) {
      next(error);
    }
  }

  async listCursadas(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters: any = {};
      if (req.query.anioLectivo) filters.anioLectivo = parseInt(req.query.anioLectivo as string);
      if (req.query.materiaId) filters.materiaId = parseInt(req.query.materiaId as string);
      if (req.query.docenteId) filters.docenteId = parseInt(req.query.docenteId as string);
      if (req.query.activo !== undefined) filters.activo = String(req.query.activo) === 'true';
      filters.page = req.query.page ? parseInt(req.query.page as string) : 1;
      filters.limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

      const result = await cursadaService.getCursadas(filters);
      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    } catch (error) {
      next(error);
    }
  }

  async getCursadaById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseId(req, res, 'ID de cursada');
      if (id === null) return;

      const cursada = await cursadaService.getCursadaById(id);
      res.json({
        success: true,
        data: cursada
      });
    } catch (error) {
      next(error);
    }
  }

  async updateCursada(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseId(req, res, 'ID de cursada');
      if (id === null) return;

      const cursada = await cursadaService.updateCursada(id, req.body, req.user!);
      res.json({
        success: true,
        message: 'Cursada actualizada exitosamente',
        data: cursada
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteCursada(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseId(req, res, 'ID de cursada');
      if (id === null) return;

      await cursadaService.deleteCursada(id, req.user!);
      res.json({
        success: true,
        message: 'Cursada eliminada exitosamente'
      });
    } catch (error) {
      next(error);
    }
  }

  async getInscriptosByCursada(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseId(req, res, 'ID de cursada');
      if (id === null) return;

      const inscriptos = await cursadaService.getInscriptosByCursada(id);
      res.json({
        success: true,
        data: inscriptos
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new CursadaController();
