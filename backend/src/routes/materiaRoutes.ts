import { Router } from 'express';
import materiaController from '../controllers/materiaController.js';
import { authMiddleware, roleCheck } from '../middleware/auth.js';
import { validationMiddleware } from '../middleware/validation.js';
import { 
  createMateriaSchema, 
  updateMateriaSchema, 
  listMateriasSchema,
  correlatividadSchema,
  asignarProfesorSchema
} from '../validations/materiaValidation.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// Rutas para admin y profesores (pueden ver materias)
router.get('/',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  validationMiddleware(listMateriasSchema, 'query'),
  materiaController.listMaterias
);

router.get('/carrera/:carreraId',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  materiaController.getMateriasByCarrera
);

// Materias agrupadas por año de cursada (selección para períodos de inscripción)
router.get('/carrera/:carreraId/por-anio',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  materiaController.getMateriasPorAnio
);

router.get('/:id',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  materiaController.getMateriaById
);

router.get('/:id/correlatividades',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  materiaController.getCorrelatividades
);

// Rutas solo para admin
router.post('/',
  roleCheck(ROLES.ADMINISTRATIVO),
  validationMiddleware(createMateriaSchema),
  materiaController.createMateria
);

router.put('/:id',
  roleCheck(ROLES.ADMINISTRATIVO),
  validationMiddleware(updateMateriaSchema),
  materiaController.updateMateria
);

router.delete('/:id',
  roleCheck(ROLES.ADMINISTRATIVO),
  materiaController.deleteMateria
);

router.post('/:id/correlatividades',
  roleCheck(ROLES.ADMINISTRATIVO),
  validationMiddleware(correlatividadSchema, 'body', { stripUnknown: false }),
  materiaController.addCorrelatividad
);

router.delete('/correlatividades/:id',
  roleCheck(ROLES.ADMINISTRATIVO),
  materiaController.removeCorrelatividad
);

// Asignación profesor ↔ materia
// Ver profesores asignados (admin y profesor)
router.get('/:id/profesores',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  materiaController.getProfesoresByMateria
);

// Asignar / desasignar (solo admin)
router.post('/:id/profesores',
  roleCheck(ROLES.ADMINISTRATIVO),
  validationMiddleware(asignarProfesorSchema),
  materiaController.asignarProfesor
);

router.delete('/:id/profesores/:profesorId',
  roleCheck(ROLES.ADMINISTRATIVO),
  materiaController.desasignarProfesor
);

export default router;
