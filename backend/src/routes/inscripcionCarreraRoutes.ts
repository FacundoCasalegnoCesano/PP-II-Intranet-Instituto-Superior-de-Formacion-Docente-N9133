import { Router } from 'express';
import inscripcionCarreraController from '../controllers/inscripcionCarreraController.js';
import { authMiddleware, roleCheck } from '../middleware/auth.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.use(authMiddleware);

// Alumno puede inscribirse a carrera (self-service)
// Admin puede inscribir a cualquier alumno
router.post('/',
  roleCheck(ROLES.ALUMNO, ROLES.ADMINISTRATIVO),
  inscripcionCarreraController.inscribirAlumno
);

// Dar de baja (Alumno o Admin)
router.delete('/:id',
  roleCheck(ROLES.ALUMNO, ROLES.ADMINISTRATIVO),
  inscripcionCarreraController.darBaja
);

// Ver carreras de un alumno (Alumno puede ver las suyas, Admin todas)
router.get('/alumno/:alumnoId',
  roleCheck(ROLES.ALUMNO, ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  inscripcionCarreraController.getCarrerasByAlumno
);

// Ver inscriptos por carrera (Solo Admin)
router.get('/carrera/:carreraId/inscriptos',
  roleCheck(ROLES.ADMINISTRATIVO),
  inscripcionCarreraController.getInscriptosByCarrera
);

export default router;