import type { Request, Response, NextFunction } from 'express';
import inscripcionHistoricaService from '../services/inscripcionHistoricaService.js';

class InscripcionHistoricaController {
  async crearMateria(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await inscripcionHistoricaService.crear(Number(req.params.id), req.body.alumnoId, req.user!);
      res.status(201).json({ success: true, message: 'Inscripción histórica creada o vinculada', data: result });
    } catch (error) { next(error); }
  }

  async crearEspacio(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await inscripcionHistoricaService.crearEspacio(Number(req.params.id), req.body.alumnoId, req.user!);
      res.status(201).json({ success: true, message: 'Inscripción histórica al espacio creada o vinculada', data: result });
    } catch (error) { next(error); }
  }
}

export default new InscripcionHistoricaController();
