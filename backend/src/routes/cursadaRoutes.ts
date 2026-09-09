import { Router } from 'express';
import cursadaController from '../controllers/cursadaController.js';
import claseController from '../controllers/claseController.js';
import { authMiddleware, roleCheck } from '../middleware/auth.js';
import { validationMiddleware } from '../middleware/validation.js';
import {
  createCursadaSchema,
  updateCursadaSchema,
  listCursadasSchema
} from '../validations/cursadaValidation.js';
import { ROLES } from '../constants/roles.js';
import {
  claseCursadaParamsSchema,
  claseParamsSchema,
  claseWriteSchema
} from '../validations/claseValidation.js';

const router = Router();

router.use(authMiddleware);

// Listar cursadas (admin o profesor)
router.get('/',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  validationMiddleware(listCursadasSchema, 'query'),
  cursadaController.listCursadas
);

// Crear cursada (solo admin)
router.post('/',
  roleCheck(ROLES.ADMINISTRATIVO),
  validationMiddleware(createCursadaSchema),
  cursadaController.createCursada
);

// Recurso atómico de clase: tema + asistencia completa.
router.get('/:cursadaId/clases',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  validationMiddleware(claseCursadaParamsSchema, 'params'),
  claseController.list
);

router.get('/:cursadaId/clases/:fecha',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  validationMiddleware(claseParamsSchema, 'params'),
  claseController.get
);

router.put('/:cursadaId/clases/:fecha',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  validationMiddleware(claseParamsSchema, 'params'),
  validationMiddleware(claseWriteSchema),
  claseController.save
);

router.delete('/:cursadaId/clases/:fecha',
  roleCheck(ROLES.ADMINISTRATIVO),
  validationMiddleware(claseParamsSchema, 'params'),
  claseController.delete
);

// Detalle (admin o profesor)
router.get('/:id',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  cursadaController.getCursadaById
);

// Actualizar (solo admin)
router.put('/:id',
  roleCheck(ROLES.ADMINISTRATIVO),
  validationMiddleware(updateCursadaSchema),
  cursadaController.updateCursada
);

// Baja lógica (solo admin)
router.delete('/:id',
  roleCheck(ROLES.ADMINISTRATIVO),
  cursadaController.deleteCursada
);

// Alumnos inscriptos a la comisión (admin o profesor)
router.get('/:id/inscriptos',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  cursadaController.getInscriptosByCursada
);

export default router;
