import { Router } from 'express';
import periodoInscripcionController from '../controllers/periodoInscripcionController.js';
import { authMiddleware, roleCheck } from '../middleware/auth.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.use(authMiddleware);

// Rutas solo para Admin
router.post('/',
  roleCheck(ROLES.ADMINISTRATIVO),
  periodoInscripcionController.crearPeriodo
);

router.put('/:id',
  roleCheck(ROLES.ADMINISTRATIVO),
  periodoInscripcionController.updatePeriodo
);

router.delete('/:id',
  roleCheck(ROLES.ADMINISTRATIVO),
  periodoInscripcionController.deletePeriodo
);

// Rutas para todos los roles
router.get('/',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR, ROLES.ALUMNO),
  periodoInscripcionController.listPeriodos
);

router.get('/activos/:tipo',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR, ROLES.ALUMNO),
  periodoInscripcionController.listPeriodosActivos
);

router.get('/verificar/:tipo',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR, ROLES.ALUMNO),
  periodoInscripcionController.verificarInscripcionHabilitada
);

router.get('/:id',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  periodoInscripcionController.getPeriodoById
);

export default router;