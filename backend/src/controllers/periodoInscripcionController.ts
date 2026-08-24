import type { Request, Response, NextFunction } from 'express';
import periodoInscripcionService from '../services/periodoInscripcionService.js';

class PeriodoInscripcionController {
  async crearPeriodo(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = req.body;
      const currentUser = req.user!;
      const periodo = await periodoInscripcionService.crearPeriodo(data, currentUser);
      
      res.status(201).json({
        success: true,
        message: 'Período de inscripción creado exitosamente',
        data: periodo
      });
    } catch (error) {
      next(error);
    }
  }

  async getPeriodoById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({
          success: false,
          message: 'ID de período no proporcionado'
        });
        return;
      }

      const id = parseInt(idParam);
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de período inválido'
        });
        return;
      }

      const periodo = await periodoInscripcionService.getPeriodoById(id);
      
      res.json({
        success: true,
        data: periodo
      });
    } catch (error) {
      next(error);
    }
  }

  async listPeriodos(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters: any = {};
      if (req.query.tipo) filters.tipo = req.query.tipo as string;
      if (req.query.activo !== undefined) filters.activo = req.query.activo === 'true';
      filters.page = req.query.page ? parseInt(req.query.page as string) : 1;
      filters.limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      
      const periodos = await periodoInscripcionService.listPeriodos(filters);
      
      res.json({
        success: true,
        data: periodos.data,
        pagination: periodos.pagination
      });
    } catch (error) {
      next(error);
    }
  }

  async listPeriodosActivos(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tipo } = req.params;
      
      // ✅ Validar que el tipo existe
      if (!tipo) {
        res.status(400).json({
          success: false,
          message: 'Tipo de período no proporcionado'
        });
        return;
      }

      // ✅ Validar que el tipo sea válido (MATERIA o EXAMEN)
      if (tipo !== 'MATERIA' && tipo !== 'EXAMEN') {
        res.status(400).json({
          success: false,
          message: 'Tipo de período inválido. Debe ser MATERIA o EXAMEN'
        });
        return;
      }

      const periodos = await periodoInscripcionService.listPeriodosActivos(tipo);
      
      res.json({
        success: true,
        data: periodos
      });
    } catch (error) {
      next(error);
    }
  }

  async verificarInscripcionHabilitada(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tipo } = req.params;
      
      // ✅ Validar que el tipo existe
      if (!tipo) {
        res.status(400).json({
          success: false,
          message: 'Tipo de período no proporcionado'
        });
        return;
      }

      // ✅ Validar que el tipo sea válido (MATERIA o EXAMEN)
      if (tipo !== 'MATERIA' && tipo !== 'EXAMEN') {
        res.status(400).json({
          success: false,
          message: 'Tipo de período inválido. Debe ser MATERIA o EXAMEN'
        });
        return;
      }

      const habilitado = await periodoInscripcionService.verificarInscripcionHabilitada(tipo);
      
      res.json({
        success: true,
        data: {
          tipo,
          habilitado,
          mensaje: habilitado ? 'Inscripción habilitada' : 'Inscripción no habilitada en este momento'
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async updatePeriodo(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({
          success: false,
          message: 'ID de período no proporcionado'
        });
        return;
      }

      const id = parseInt(idParam);
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de período inválido'
        });
        return;
      }

      const data = req.body;
      const currentUser = req.user!;
      const periodo = await periodoInscripcionService.updatePeriodo(id, data, currentUser);
      
      res.json({
        success: true,
        message: 'Período de inscripción actualizado exitosamente',
        data: periodo
      });
    } catch (error) {
      next(error);
    }
  }

  async deletePeriodo(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.id;
      if (!idParam) {
        res.status(400).json({
          success: false,
          message: 'ID de período no proporcionado'
        });
        return;
      }

      const id = parseInt(idParam);
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de período inválido'
        });
        return;
      }

      const currentUser = req.user!;
      await periodoInscripcionService.deletePeriodo(id, currentUser);
      
      res.json({
        success: true,
        message: 'Período de inscripción eliminado exitosamente'
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new PeriodoInscripcionController();
