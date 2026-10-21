import { Router } from 'express';
import promocionHistoricaController from '../controllers/promocionHistoricaController.js';
import { authMiddleware, roleCheck } from '../middleware/auth.js';
import { validationMiddleware } from '../middleware/validation.js';
import { ROLES } from '../constants/roles.js';
import { createPromocionHistoricaSchema, listPromocionesHistoricasSchema, promocionHistoricaIdSchema, updatePromocionHistoricaSchema } from '../validations/promocionHistoricaValidation.js';

const router = Router();
router.use(authMiddleware, roleCheck(ROLES.ADMINISTRATIVO));
router.get('/', validationMiddleware(listPromocionesHistoricasSchema, 'query'), promocionHistoricaController.list);
router.post('/', validationMiddleware(createPromocionHistoricaSchema), promocionHistoricaController.create);
router.patch('/:id', validationMiddleware(promocionHistoricaIdSchema, 'params'), validationMiddleware(updatePromocionHistoricaSchema), promocionHistoricaController.update);
export default router;
