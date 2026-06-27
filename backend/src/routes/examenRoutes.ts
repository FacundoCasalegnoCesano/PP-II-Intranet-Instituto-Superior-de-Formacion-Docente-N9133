import { Router } from 'express';
import examenController from '../controllers/examenController.js';
import { authMiddleware, roleCheck } from '../middleware/auth.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.use(authMiddleware);

// ===== EXÁMENES =====
router.post('/',
  roleCheck(ROLES.ADMINISTRATIVO),
  examenController.createExamen
);

router.get('/',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  examenController.listExamenes
);

router.get('/:id',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR, ROLES.ALUMNO),
  examenController.getExamenById
);

router.put('/:id',
  roleCheck(ROLES.ADMINISTRATIVO),
  examenController.updateExamen
);

router.delete('/:id',
  roleCheck(ROLES.ADMINISTRATIVO),
  examenController.deleteExamen
);

// ===== TRIBUNALES =====
router.post('/tribunales',
  roleCheck(ROLES.ADMINISTRATIVO),
  examenController.addTribunal
);

router.delete('/tribunales/:id',
  roleCheck(ROLES.ADMINISTRATIVO),
  examenController.removeTribunal
);

// ===== INSCRIPCIÓN A EXÁMENES =====
router.post('/:examenId/inscribir',
  roleCheck(ROLES.ALUMNO, ROLES.ADMINISTRATIVO),
  examenController.inscribirAlumno
);

router.post('/:examenId/desinscribir',
  roleCheck(ROLES.ALUMNO, ROLES.ADMINISTRATIVO),
  examenController.desinscribirAlumno
);

router.get('/:examenId/inscriptos',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  examenController.getInscriptosByExamen
);

router.get('/alumno/:alumnoId/inscripciones',
  roleCheck(ROLES.ALUMNO, ROLES.ADMINISTRATIVO),
  examenController.getInscripcionesByAlumno
);

// ===== CALIFICACIONES =====
router.post('/:examenId/calificacion',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  examenController.registrarNota
);

export default router;