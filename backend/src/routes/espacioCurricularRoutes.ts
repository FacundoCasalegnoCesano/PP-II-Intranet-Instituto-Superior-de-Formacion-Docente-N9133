import { Router } from 'express';
import espacioCurricularController from '../controllers/espacioCurricularController.js';
import { authMiddleware, roleCheck } from '../middleware/auth.js';
import { validationMiddleware } from '../middleware/validation.js';
import { ROLES } from '../constants/roles.js';
import {
  createEspacioCorrelatividadSchema,
  createEspacioCurricularSchema,
  prerequisiteParamsSchema,
  spaceIdParamsSchema,
  updateEspacioCurricularSchema
} from '../validations/espacioCurricularValidation.js';

const router = Router();
router.use(authMiddleware, roleCheck(ROLES.ADMINISTRATIVO));

router.get('/', espacioCurricularController.list);
router.post('/', validationMiddleware(createEspacioCurricularSchema), espacioCurricularController.create);
router.get('/:id', validationMiddleware(spaceIdParamsSchema, 'params'), espacioCurricularController.get);
router.patch('/:id', validationMiddleware(spaceIdParamsSchema, 'params'), validationMiddleware(updateEspacioCurricularSchema), espacioCurricularController.update);
router.post('/:id/activate', validationMiddleware(spaceIdParamsSchema, 'params'), espacioCurricularController.activate);
router.get('/:id/correlatividades', validationMiddleware(spaceIdParamsSchema, 'params'), espacioCurricularController.listPrerequisites);
router.post('/:id/correlatividades', validationMiddleware(spaceIdParamsSchema, 'params'), validationMiddleware(createEspacioCorrelatividadSchema), espacioCurricularController.addPrerequisite);
router.delete('/:id/correlatividades/:correlatividadId', validationMiddleware(prerequisiteParamsSchema, 'params'), espacioCurricularController.removePrerequisite);

export default router;
