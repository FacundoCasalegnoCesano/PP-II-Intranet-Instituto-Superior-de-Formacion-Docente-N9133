import type { NextFunction, Request, Response } from 'express';
import horarioPublicadoService from '../services/horarioPublicadoService.js';
import { AppError } from '../utils/AppError.js';

function idParametrico(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    throw new AppError(400, 'ID de documento inválido');
  }
  return id;
}

class HorarioPublicadoController {
  async listarAnios(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, data: await horarioPublicadoService.listarAnios() });
    } catch (error) { next(error); }
  }

  async obtenerActual(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, data: await horarioPublicadoService.obtenerActual(req.query.cicloLectivo as unknown as number | undefined) });
    } catch (error) { next(error); }
  }

  async descargarArchivo(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const archivo = await horarioPublicadoService.obtenerArchivo(idParametrico(req), req.user!);
      res.type('application/pdf');
      res.sendFile(archivo.ruta);
    } catch (error) { next(error); }
  }

  async publicar(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const resultado = await horarioPublicadoService.publicarArchivo(req.body, req.file, req.user!);
      res.status(resultado.reutilizado ? 200 : 201).json({
        success: true,
        message: resultado.reutilizado ? 'Se restauró el documento idéntico ya publicado' : 'Horario publicado exitosamente',
        data: resultado
      });
    } catch (error) { next(error); }
  }

  async historial(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, data: await horarioPublicadoService.obtenerHistorial(req.query.cicloLectivo as unknown as number, req.user!) });
    } catch (error) { next(error); }
  }

  async restaurar(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({
        success: true,
        message: 'Versión de horario restaurada exitosamente',
        data: await horarioPublicadoService.restaurar(idParametrico(req), req.user!)
      });
    } catch (error) { next(error); }
  }
}

export default new HorarioPublicadoController();
