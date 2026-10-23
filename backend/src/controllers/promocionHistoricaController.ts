import type { Request, Response, NextFunction } from 'express';
import promocionHistoricaService from '../services/promocionHistoricaService.js';

class PromocionHistoricaController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { res.json({ success: true, data: await promocionHistoricaService.list(req.query, req.user!) }); }
    catch (error) { next(error); }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await promocionHistoricaService.create(req.body, req.user!);
      res.status(201).json({ success: true, message: 'Promoción histórica registrada', data });
    } catch (error) { next(error); }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await promocionHistoricaService.update(Number(req.params.id), req.body, req.user!);
      res.json({ success: true, message: 'Promoción histórica corregida', data });
    } catch (error) { next(error); }
  }
}

export default new PromocionHistoricaController();
