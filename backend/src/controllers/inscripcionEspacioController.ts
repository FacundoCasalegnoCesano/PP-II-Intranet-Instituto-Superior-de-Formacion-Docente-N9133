import type { Request, Response, NextFunction } from 'express';
import { ROLES } from '../constants/roles.js';
import { AppError } from '../utils/AppError.js';
import inscripcionEspacioService from '../services/inscripcionEspacioService.js';

function usuarioDestino(req: Request): number {
  if (req.user!.rol !== ROLES.ADMINISTRATIVO) return req.user!.id;
  const id = Number(req.query.alumnoId);
  if (!Number.isInteger(id) || id < 1) throw new AppError(400, 'Para administrativos, alumnoId es requerido y debe ser Usuario.idUsuario');
  return id;
}

class InscripcionEspacioController {
  async disponibles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const cicloLectivo = Number(req.query.cicloLectivo ?? new Date().getFullYear());
      const data = await inscripcionEspacioService.disponibles(usuarioDestino(req), cicloLectivo);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  }

  async verificar(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await inscripcionEspacioService.verificar(Number(req.params.cursadaEspacioId), usuarioDestino(req), req.user!);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  }

  async listar(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await inscripcionEspacioService.listar(req.user!.id);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  }

  async inscribir(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const alumnoId = req.user!.rol === ROLES.ADMINISTRATIVO ? Number(req.body.alumnoId) : req.user!.id;
      const data = await inscripcionEspacioService.inscribir(req.body.cursadaEspacioId, req.body.modalidadElegida, alumnoId, req.user!);
      res.status(201).json({ success: true, message: 'Inscripción al espacio creada exitosamente', data });
    } catch (error) { next(error); }
  }

  async darBaja(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await inscripcionEspacioService.darBaja(Number(req.params.id), req.user!);
      res.json({ success: true, message: 'Inscripción al espacio dada de baja', data });
    } catch (error) { next(error); }
  }
}

export default new InscripcionEspacioController();
