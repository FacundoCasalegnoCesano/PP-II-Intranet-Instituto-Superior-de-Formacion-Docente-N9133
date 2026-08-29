import type { Request, Response, NextFunction } from 'express';
import libroDeTemaService from '../services/libroDeTemaService.js';

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

class LibroDeTemaController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters: any = {};
      if (req.query.materiaId) filters.materiaId = parseInt(req.query.materiaId as string);
      if (req.query.fechaDesde) filters.fechaDesde = req.query.fechaDesde as string;
      if (req.query.fechaHasta) filters.fechaHasta = req.query.fechaHasta as string;

      const result = await libroDeTemaService.list(filters, req.user!);
      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const fecha = new Date(req.body.fecha);
      const registro = await libroDeTemaService.create(
        { ...req.body, fecha },
        req.user!
      );
      res.status(201).json({
        success: true,
        message: 'Registro del libro de temas creado exitosamente',
        data: registro
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseId(req, res, 'ID de registro');
      if (id === null) return;

      const registro = await libroDeTemaService.getById(id, req.user!);
      res.json({
        success: true,
        data: registro
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseId(req, res, 'ID de registro');
      if (id === null) return;

      const data: any = { ...req.body };
      if (data.fecha) data.fecha = new Date(data.fecha);

      const registro = await libroDeTemaService.update(id, data, req.user!);
      res.json({
        success: true,
        message: 'Registro del libro de temas actualizado exitosamente',
        data: registro
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseId(req, res, 'ID de registro');
      if (id === null) return;

      await libroDeTemaService.delete(id, req.user!);
      res.json({
        success: true,
        message: 'Registro del libro de temas eliminado exitosamente'
      });
    } catch (error) {
      next(error);
    }
  }

  async getByMateria(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const materiaId = parseInt(req.params.materiaId as string);
      if (isNaN(materiaId)) {
        res.status(400).json({
          success: false,
          message: 'ID de materia inválido'
        });
        return;
      }

      const registros = await libroDeTemaService.getByMateria(materiaId, req.user!);
      res.json({
        success: true,
        data: registros
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new LibroDeTemaController();
