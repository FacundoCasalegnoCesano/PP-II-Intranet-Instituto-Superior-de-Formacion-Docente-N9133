import { Router } from 'express';
import carreraController from '../controllers/carreraController.js';
import { authMiddleware, roleCheck } from '../middleware/auth.js';
import { validationMiddleware } from '../middleware/validation.js';
import { createCarreraSchema, updateCarreraSchema, listCarrerasSchema } from '../validations/carreraValidation.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// Rutas para admin y profesores (pueden ver carreras)
router.get('/',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  validationMiddleware(listCarrerasSchema, 'query'),
  carreraController.listCarreras
);

router.get('/:id/plan-estudio',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  carreraController.getPlanEstudio
);

router.get('/:id',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  carreraController.getCarreraById
);

// Rutas solo para admin
router.post('/',
  roleCheck(ROLES.ADMINISTRATIVO),
  validationMiddleware(createCarreraSchema),
  carreraController.createCarrera
);

router.put('/:id',
  roleCheck(ROLES.ADMINISTRATIVO),
  validationMiddleware(updateCarreraSchema),
  carreraController.updateCarrera
);

router.delete('/:id',
  roleCheck(ROLES.ADMINISTRATIVO),
  carreraController.deleteCarrera
);

export default router;