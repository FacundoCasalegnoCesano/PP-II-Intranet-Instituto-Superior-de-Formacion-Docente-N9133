import { Router } from 'express';
import asistenciaController from '../controllers/asistenciaController.js';
import { authMiddleware, roleCheck } from '../middleware/auth.js';
import { validationMiddleware } from '../middleware/validation.js';
import { cargaMasivaSchema, listAsistenciasQuerySchema } from '../validations/asistenciaValidation.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// Carga masiva de una clase (admin o profesor asignado)
router.post('/carga-masiva',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  validationMiddleware(cargaMasivaSchema),
  asistenciaController.cargarClase
);

// Listado por cursada con filtro opcional de fecha (admin o profesor)
router.get('/cursada/:cursadaId',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  validationMiddleware(listAsistenciasQuerySchema, 'query'),
  asistenciaController.getByCursada
);

// Resumen con porcentaje por alumno (admin o profesor)
router.get('/resumen/:cursadaId',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  asistenciaController.getResumenCursada
);

// Historial del alumno (el propio o administrativo). Los profesores consultan
// asistencia desde sus cursadas autorizadas.
router.get('/alumno/:alumnoId',
  roleCheck(ROLES.ALUMNO, ROLES.ADMINISTRATIVO),
  asistenciaController.getByAlumno
);

export default router;
