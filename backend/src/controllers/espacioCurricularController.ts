import type { Request, Response, NextFunction } from 'express';
import espacioCurricularService from '../services/espacioCurricularService.js';

class EspacioCurricularController {
  async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try { res.json({ success: true, data: await espacioCurricularService.list() }); }
    catch (error) { next(error); }
  }

  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { res.json({ success: true, data: await espacioCurricularService.get(Number(req.params.id)) }); }
    catch (error) { next(error); }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { res.status(201).json({ success: true, message: 'Espacio curricular creado', data: await espacioCurricularService.create(req.body) }); }
    catch (error) { next(error); }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { res.json({ success: true, message: 'Espacio curricular actualizado', data: await espacioCurricularService.update(Number(req.params.id), req.body) }); }
    catch (error) { next(error); }
  }

  async activate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { res.json({ success: true, message: 'Espacio curricular activado', data: await espacioCurricularService.activate(Number(req.params.id)) }); }
    catch (error) { next(error); }
  }

  async listPrerequisites(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { res.json({ success: true, data: await espacioCurricularService.listPrerequisites(Number(req.params.id)) }); }
    catch (error) { next(error); }
  }

  async addPrerequisite(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { res.status(201).json({ success: true, message: 'Correlatividad agregada', data: await espacioCurricularService.addPrerequisite(Number(req.params.id), req.body) }); }
    catch (error) { next(error); }
  }

  async removePrerequisite(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await espacioCurricularService.removePrerequisite(Number(req.params.id), Number(req.params.correlatividadId));
      res.json({ success: true, message: 'Correlatividad quitada' });
    } catch (error) { next(error); }
  }
}

export default new EspacioCurricularController();
