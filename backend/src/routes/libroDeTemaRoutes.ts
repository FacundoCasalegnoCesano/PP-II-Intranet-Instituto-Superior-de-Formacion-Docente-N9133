import { Router } from 'express';
import libroDeTemaController from '../controllers/libroDeTemaController.js';
import { authMiddleware, roleCheck } from '../middleware/auth.js';
import { validationMiddleware } from '../middleware/validation.js';
import {
  createLibroDeTemaSchema,
  updateLibroDeTemaSchema,
  listLibroDeTemasSchema
} from '../validations/libroDeTemaValidation.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.use(authMiddleware);

// Listar registros (admin o profesor)
router.get('/',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  validationMiddleware(listLibroDeTemasSchema, 'query'),
  libroDeTemaController.list
);

// Crear registro (admin o profesor de la materia)
router.post('/',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  validationMiddleware(createLibroDeTemaSchema),
  libroDeTemaController.create
);

// Registros por materia (admin o profesor)
router.get('/materia/:materiaId',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  libroDeTemaController.getByMateria
);

// Detalle (admin o profesor)
router.get('/:id',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  libroDeTemaController.getById
);

// Actualizar (admin o profesor de la materia)
router.put('/:id',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  validationMiddleware(updateLibroDeTemaSchema),
  libroDeTemaController.update
);

// Eliminar (solo admin)
router.delete('/:id',
  roleCheck(ROLES.ADMINISTRATIVO),
  libroDeTemaController.delete
);

export default router;
