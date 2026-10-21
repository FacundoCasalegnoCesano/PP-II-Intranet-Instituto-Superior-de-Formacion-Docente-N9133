import { Router } from 'express';
import { authMiddleware, roleCheck } from '../middleware/auth.js';
import { validationMiddleware } from '../middleware/validation.js';
import { ROLES } from '../constants/roles.js';
import inscripcionEspacioController from '../controllers/inscripcionEspacioController.js';
import { cicloEspacioQuerySchema, inscribirEspacioSchema, matriculaEspacioParamsSchema, verificarEspacioParamsSchema } from '../validations/inscripcionEspacioValidation.js';

const router = Router();
router.use(authMiddleware);

router.get('/disponibles', roleCheck(ROLES.ALUMNO, ROLES.ADMINISTRATIVO), validationMiddleware(cicloEspacioQuerySchema, 'query'), inscripcionEspacioController.disponibles);
router.get('/verificar/:cursadaEspacioId', roleCheck(ROLES.ALUMNO, ROLES.ADMINISTRATIVO), validationMiddleware(verificarEspacioParamsSchema, 'params'), validationMiddleware(cicloEspacioQuerySchema, 'query'), inscripcionEspacioController.verificar);
router.get('/', roleCheck(ROLES.ALUMNO), inscripcionEspacioController.listar);
router.post('/', roleCheck(ROLES.ALUMNO, ROLES.ADMINISTRATIVO), validationMiddleware(inscribirEspacioSchema), inscripcionEspacioController.inscribir);
router.delete('/:id', roleCheck(ROLES.ALUMNO, ROLES.ADMINISTRATIVO), validationMiddleware(matriculaEspacioParamsSchema, 'params'), inscripcionEspacioController.darBaja);

export default router;
