import type { Request, Response, NextFunction } from 'express';
import examenHistoricoService from '../services/examenHistoricoService.js';

class ExamenHistoricoController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rows = await examenHistoricoService.list(req.query, req.user!);
      res.json({ success: true, data: rows });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const row = await examenHistoricoService.create(req.body, req.user!);
      res.status(201).json({ success: true, message: 'Resultado histórico registrado', data: row });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const row = await examenHistoricoService.update(id, req.body, req.user!);
      res.json({ success: true, message: 'Resultado histórico actualizado', data: row });
    } catch (error) {
      next(error);
    }
  }
}

export default new ExamenHistoricoController();
