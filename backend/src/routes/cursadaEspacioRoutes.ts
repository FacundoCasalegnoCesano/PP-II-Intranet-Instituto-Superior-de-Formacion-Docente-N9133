import { Router } from 'express';
import { authMiddleware, roleCheck } from '../middleware/auth.js';
import { validationMiddleware } from '../middleware/validation.js';
import { ROLES } from '../constants/roles.js';
import cursadaEspacioController from '../controllers/cursadaEspacioController.js';
import inscripcionHistoricaController from '../controllers/inscripcionHistoricaController.js';
import { inscripcionHistoricaBodySchema, inscripcionHistoricaParamsSchema } from '../validations/inscripcionHistoricaValidation.js';
import { actualizarCursadaEspacioSchema, crearCursadaEspacioSchema, cursadaEspacioIdParamsSchema, listarCursadasEspacioSchema } from '../validations/cursadaEspacioValidation.js';

const router = Router();
router.use(authMiddleware, roleCheck(ROLES.ADMINISTRATIVO));

router.get('/', validationMiddleware(listarCursadasEspacioSchema, 'query'), cursadaEspacioController.list);
router.post('/', validationMiddleware(crearCursadaEspacioSchema), cursadaEspacioController.create);
router.post('/:id/inscripciones-historicas', validationMiddleware(inscripcionHistoricaParamsSchema, 'params'), validationMiddleware(inscripcionHistoricaBodySchema), inscripcionHistoricaController.crearEspacio);
router.get('/:id', validationMiddleware(cursadaEspacioIdParamsSchema, 'params'), cursadaEspacioController.get);
router.put('/:id', validationMiddleware(cursadaEspacioIdParamsSchema, 'params'), validationMiddleware(actualizarCursadaEspacioSchema), cursadaEspacioController.update);
router.delete('/:id', validationMiddleware(cursadaEspacioIdParamsSchema, 'params'), cursadaEspacioController.deactivate);

export default router;
