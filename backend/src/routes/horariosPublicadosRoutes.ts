import { Router } from 'express';
import multer from 'multer';
import horarioPublicadoController from '../controllers/horarioPublicadoController.js';
import { ROLES } from '../constants/roles.js';
import { authMiddleware, roleCheck } from '../middleware/auth.js';
import { validationMiddleware } from '../middleware/validation.js';
import { AppError } from '../utils/AppError.js';
import { cicloLectivoQuerySchema, idDocumentoSchema, publicarHorarioSchema } from '../validations/horarioPublicadoValidation.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

const cargarArchivo = (req: any, res: any, next: any): void => {
  upload.single('archivo')(req, res, (error: any) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') return next(new AppError(400, 'El archivo PDF supera el límite de 10 MB'));
      if (error.code === 'LIMIT_UNEXPECTED_FILE') return next(new AppError(400, 'Solo se permite un archivo en el campo archivo'));
      if (error.code === 'LIMIT_FILE_COUNT') return next(new AppError(400, 'Solo se permite un archivo PDF por publicación'));
      if (error.code === 'LIMIT_PART_COUNT') return next(new AppError(400, 'La carga multipart supera el límite permitido'));
      if (error.code === 'LIMIT_FIELD_COUNT') return next(new AppError(400, 'La carga multipart contiene demasiados campos'));
      if (error.code === 'LIMIT_FIELD_KEY') return next(new AppError(400, 'El nombre de un campo multipart es demasiado largo'));
      if (error.code === 'LIMIT_FIELD_VALUE') return next(new AppError(400, 'El valor de un campo multipart es demasiado largo'));
      return next(new AppError(400, 'La carga multipart no es válida'));
    }
    return next(error);
  });
};

router.use(authMiddleware);

router.get('/anios', horarioPublicadoController.listarAnios);
router.get('/actual', validationMiddleware(cicloLectivoQuerySchema, 'query'), horarioPublicadoController.obtenerActual);
router.get('/historial', roleCheck(ROLES.ADMINISTRATIVO), validationMiddleware(publicarHorarioSchema, 'query'), horarioPublicadoController.historial);
router.post('/', roleCheck(ROLES.ADMINISTRATIVO), cargarArchivo, validationMiddleware(publicarHorarioSchema), horarioPublicadoController.publicar);
router.post('/:id/publicar', roleCheck(ROLES.ADMINISTRATIVO), validationMiddleware(idDocumentoSchema, 'params'), horarioPublicadoController.restaurar);
router.get('/:id/archivo', validationMiddleware(idDocumentoSchema, 'params'), horarioPublicadoController.descargarArchivo);

export default router;
