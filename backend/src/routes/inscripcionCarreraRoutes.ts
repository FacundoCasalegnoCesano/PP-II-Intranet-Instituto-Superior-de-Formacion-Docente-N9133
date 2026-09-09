import { Router } from 'express';
import inscripcionCarreraController from '../controllers/inscripcionCarreraController.js';
import { authMiddleware, roleCheck } from '../middleware/auth.js';
import { validationMiddleware } from '../middleware/validation.js';
import { inscripcionCarreraSchema } from '../validations/inscripcionCarreraValidation.js';
import { ROLES } from '../constants/roles.js';
import { paginationQuerySchema } from '../validations/paginationValidation.js';

const router = Router();

router.use(authMiddleware);

// Solo admin puede inscribir a cualquier alumno
router.post('/',
  roleCheck(ROLES.ADMINISTRATIVO),
  validationMiddleware(inscripcionCarreraSchema),
  inscripcionCarreraController.inscribirAlumno
);

// Dar de baja (solo Admin)
router.delete('/:id',
  roleCheck(ROLES.ADMINISTRATIVO),
  inscripcionCarreraController.darBaja
);

// Ver carreras de un alumno (Alumno puede ver las suyas, Admin todas)
router.get('/alumno/:alumnoId',
  roleCheck(ROLES.ALUMNO, ROLES.ADMINISTRATIVO),
  inscripcionCarreraController.getCarrerasByAlumno
);

// Ver inscriptos por carrera (Solo Admin)
router.get('/carrera/:carreraId/inscriptos',
  roleCheck(ROLES.ADMINISTRATIVO),
  validationMiddleware(paginationQuerySchema, 'query'),
  inscripcionCarreraController.getInscriptosByCarrera
);

export default router;
