import type { NextFunction, Request, Response } from 'express';
import claseService from '../services/claseService.js';

function cursadaId(req: Request): number {
  return Number(req.params.cursadaId);
}

class ClaseController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await claseService.listClasses(cursadaId(req), req.user!);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await claseService.getClass(cursadaId(req), req.params.fecha!, req.user!);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async save(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await claseService.saveClass(cursadaId(req), req.params.fecha!, req.body, req.user!);
      res.json({ success: true, message: 'Clase registrada exitosamente', data });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await claseService.deleteClass(cursadaId(req), req.params.fecha!, req.user!);
      res.json({ success: true, message: 'Clase eliminada exitosamente', data });
    } catch (error) {
      next(error);
    }
  }
}

export default new ClaseController();
