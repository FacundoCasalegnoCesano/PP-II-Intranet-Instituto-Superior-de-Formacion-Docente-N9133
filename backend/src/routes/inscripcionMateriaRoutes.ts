import { Router } from 'express';
import inscripcionMateriaController from '../controllers/inscripcionMateriaController.js';
import { authMiddleware, roleCheck } from '../middleware/auth.js';
import { validationMiddleware } from '../middleware/validation.js';
import {
  inscripcionMateriaSchema,
  cambiarModalidadSchema
} from '../validations/inscripcionMateriaValidation.js';
import { ROLES } from '../constants/roles.js';
import { paginationQuerySchema } from '../validations/paginationValidation.js';

const router = Router();

router.use(authMiddleware);

// ============================================
// NUEVOS ENDPOINTS PARA ALUMNOS
// ============================================

// Obtener materias disponibles para el alumno (con horarios)
router.get('/disponibles',
  roleCheck(ROLES.ALUMNO, ROLES.ADMINISTRATIVO),
  inscripcionMateriaController.getMateriasDisponibles
);

// Verificar si puede inscribirse a una materia
router.get('/verificar/:materiaId',
  roleCheck(ROLES.ALUMNO, ROLES.ADMINISTRATIVO),
  inscripcionMateriaController.verificarInscripcion
);

// ============================================
// ENDPOINTS EXISTENTES
// ============================================

// Alumno puede inscribirse a materia (self-service)
// Admin puede inscribir a cualquier alumno
router.post('/',
  roleCheck(ROLES.ALUMNO, ROLES.ADMINISTRATIVO),
  validationMiddleware(inscripcionMateriaSchema),
  inscripcionMateriaController.inscribirAlumno
);

// Dar de baja (Alumno o Admin)
router.delete('/:id',
  roleCheck(ROLES.ALUMNO, ROLES.ADMINISTRATIVO),
  inscripcionMateriaController.darBaja
);

// Ver materias de un alumno (Alumno puede ver las suyas, Admin todas)
router.get('/alumno/:alumnoId',
  roleCheck(ROLES.ALUMNO, ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  validationMiddleware(paginationQuerySchema, 'query'),
  inscripcionMateriaController.getMateriasByAlumno
);

// Ver inscriptos por materia (Solo Admin)
router.get('/materia/:materiaId/inscriptos',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  validationMiddleware(paginationQuerySchema, 'query'),
  inscripcionMateriaController.getInscriptosByMateria
);

// Ver historial de un alumno en una materia
router.get('/historial/:alumnoId/:materiaId',
  roleCheck(ROLES.ALUMNO, ROLES.ADMINISTRATIVO),
  inscripcionMateriaController.getHistorialAlumnoMateria
);

// Cambiar modalidad (Solo Admin)
router.put('/:id/modalidad',
  roleCheck(ROLES.ADMINISTRATIVO),
  validationMiddleware(cambiarModalidadSchema),
  inscripcionMateriaController.cambiarModalidad
);

export default router;
