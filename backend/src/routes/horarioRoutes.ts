import { Router } from 'express';
import horarioController from '../controllers/horarioController.js';
import { authMiddleware, roleCheck } from '../middleware/auth.js';
import { validationMiddleware } from '../middleware/validation.js';
import { createHorarioSchema, updateHorarioSchema } from '../validations/horarioValidation.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.use(authMiddleware);

// Rutas solo para Admin
router.post('/',
  roleCheck(ROLES.ADMINISTRATIVO),
  validationMiddleware(createHorarioSchema),
  horarioController.crearHorario
);

router.put('/:id',
  roleCheck(ROLES.ADMINISTRATIVO),
  validationMiddleware(updateHorarioSchema),
  horarioController.updateHorario
);

router.delete('/:id',
  roleCheck(ROLES.ADMINISTRATIVO),
  horarioController.deleteHorario
);

// Rutas para Admin y Profesor
router.get('/:id',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  horarioController.getHorarioById
);

router.get('/cursada/:cursadaId',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  horarioController.getHorariosByCursada
);

router.get('/materia/:materiaId',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  horarioController.getHorariosByMateria
);

export default router;