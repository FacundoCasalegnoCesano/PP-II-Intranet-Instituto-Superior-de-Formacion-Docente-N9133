import { Router } from 'express';
import calificacionController from '../controllers/calificacionController.js';
import { authMiddleware, roleCheck } from '../middleware/auth.js';
import { validationMiddleware } from '../middleware/validation.js';
import {
  cargaCalificacionesSchema,
  cursadasDisponiblesQuerySchema,
  listCalificacionesQuerySchema
} from '../validations/calificacionValidation.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authMiddleware);

router.get('/cursadas-disponibles',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  validationMiddleware(cursadasDisponiblesQuerySchema, 'query'),
  calificacionController.getCursadasDisponibles
);

// Carga masiva de notas (admin o profesor asignado)
router.post('/carga-masiva',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  validationMiddleware(cargaCalificacionesSchema),
  calificacionController.cargarLote
);

// Listado por cursada con filtros (admin o profesor)
router.get('/cursada/:cursadaId',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  validationMiddleware(listCalificacionesQuerySchema, 'query'),
  calificacionController.getByCursada
);

// Resumen por alumno con promedio y cumplimiento (admin o profesor)
router.get('/resumen/:cursadaId',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  calificacionController.getResumenCursada
);

// Historial del alumno (el propio o administrativo). Los profesores consultan
// calificaciones desde sus cursadas autorizadas.
router.get('/alumno/:alumnoId',
  roleCheck(ROLES.ALUMNO, ROLES.ADMINISTRATIVO),
  calificacionController.getByAlumno
);

// Mis calificaciones (alumno autenticado - read only)
router.get('/mis-calificaciones',
  roleCheck(ROLES.ALUMNO),
  calificacionController.getMisCalificaciones
);

export default router;
