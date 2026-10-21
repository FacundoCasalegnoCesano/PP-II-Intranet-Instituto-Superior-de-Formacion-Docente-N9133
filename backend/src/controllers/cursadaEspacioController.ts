import type { Request, Response, NextFunction } from 'express';
import cursadaEspacioService from '../services/cursadaEspacioService.js';

class CursadaEspacioController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await cursadaEspacioService.create(req.body, req.user!);
      res.status(201).json({ success: true, message: 'Cursada del espacio creada exitosamente', data });
    } catch (error) { next(error); }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await cursadaEspacioService.list({
        page: Number(req.query.page ?? 1), limit: Number(req.query.limit ?? 20),
        ...(req.query.carreraId ? { carreraId: Number(req.query.carreraId) } : {}),
        ...(req.query.anioLectivo ? { anioLectivo: Number(req.query.anioLectivo) } : {}),
        ...(req.query.activo !== undefined ? { activo: String(req.query.activo) === 'true' } : {}),
        ...(req.query.search ? { search: String(req.query.search) } : {})
      }, req.user!);
      res.json({ success: true, ...result });
    } catch (error) { next(error); }
  }

  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, data: await cursadaEspacioService.get(Number(req.params.id), req.user!) });
    } catch (error) { next(error); }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, message: 'Cursada del espacio actualizada', data: await cursadaEspacioService.update(Number(req.params.id), req.body, req.user!) });
    } catch (error) { next(error); }
  }

  async deactivate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, message: 'Cursada del espacio desactivada', data: await cursadaEspacioService.deactivate(Number(req.params.id), req.user!) });
    } catch (error) { next(error); }
  }
}

export default new CursadaEspacioController();
