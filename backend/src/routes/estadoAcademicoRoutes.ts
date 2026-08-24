import { Router } from 'express';
import estadoAcademicoController from '../controllers/estadoAcademicoController.js';
import { authMiddleware, roleCheck } from '../middleware/auth.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// Estados de todos los alumnos de una materia (admin: cualquier materia;
// profesor: solo las que tiene asignadas — se valida en el service)
router.get('/materia/:materiaId',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  estadoAcademicoController.getPorMateria
);

// Estado académico de un alumno (el propio si es ALUMNO; admin y profesor pueden consultar)
router.get('/alumno/:alumnoId',
  roleCheck(ROLES.ALUMNO, ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  estadoAcademicoController.getPorAlumno
);

// Art. 61 RAI: promedio general de la carrera (opcional ?carreraId=)
router.get('/promedio/:alumnoId',
  roleCheck(ROLES.ALUMNO, ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  estadoAcademicoController.getPromedioGeneral
);

export default router;