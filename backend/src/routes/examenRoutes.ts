import { Router } from 'express';
import examenController from '../controllers/examenController.js';
import { authMiddleware, roleCheck } from '../middleware/auth.js';
import { validationMiddleware } from '../middleware/validation.js';
import {
  createExamenSchema,
  updateExamenSchema,
  tribunalSchema,
  inscripcionExamenSchema,
  notaExamenSchema
} from '../validations/examenValidation.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.use(authMiddleware);

// ===== EXÁMENES =====
router.post('/',
  roleCheck(ROLES.ADMINISTRATIVO),
  validationMiddleware(createExamenSchema),
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
  validationMiddleware(updateExamenSchema),
  examenController.updateExamen
);

router.delete('/:id',
  roleCheck(ROLES.ADMINISTRATIVO),
  examenController.deleteExamen
);

// ===== TRIBUNALES =====
router.post('/tribunales',
  roleCheck(ROLES.ADMINISTRATIVO),
  validationMiddleware(tribunalSchema),
  examenController.addTribunal
);

router.delete('/tribunales/:id',
  roleCheck(ROLES.ADMINISTRATIVO),
  examenController.removeTribunal
);

// ===== INSCRIPCIÓN A EXÁMENES =====
router.post('/:examenId/inscribir',
  roleCheck(ROLES.ALUMNO, ROLES.ADMINISTRATIVO),
  validationMiddleware(inscripcionExamenSchema),
  examenController.inscribirAlumno
);

router.post('/:examenId/desinscribir',
  roleCheck(ROLES.ALUMNO, ROLES.ADMINISTRATIVO),
  validationMiddleware(inscripcionExamenSchema),
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
  validationMiddleware(notaExamenSchema),
  examenController.registrarNota
);

export default router;
