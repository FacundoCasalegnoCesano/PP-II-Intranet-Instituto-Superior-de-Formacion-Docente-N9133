import { Router } from 'express';
import homologacionController from '../controllers/homologacionController.js';
import { authMiddleware, roleCheck } from '../middleware/auth.js';
import { validationMiddleware } from '../middleware/validation.js';
import {
  crearHomologacionSchema,
  resolverHomologacionSchema,
  notaComplementariaSchema
  , listarHomologacionesSchema
} from '../validations/homologacionValidation.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.use(authMiddleware);

// Alumno: mis solicitudes
router.get('/mis-solicitudes',
  roleCheck(ROLES.ALUMNO),
  homologacionController.getMisSolicitudes
);

// Admin: crear solicitud
router.post('/',
  roleCheck(ROLES.ADMINISTRATIVO),
  validationMiddleware(crearHomologacionSchema),
  homologacionController.crear
);

// Admin: listar con filtros
router.get('/',
  roleCheck(ROLES.ADMINISTRATIVO),
  validationMiddleware(listarHomologacionesSchema, 'query'),
  homologacionController.listar
);

// Admin: cargar nota complementaria
router.post('/:id/nota-complementaria',
  roleCheck(ROLES.ADMINISTRATIVO),
  validationMiddleware(notaComplementariaSchema),
  homologacionController.cargarNotaComplementaria
);

// Admin: resolver (aprobar/rechazar)
router.post('/:id/resolver',
  roleCheck(ROLES.ADMINISTRATIVO),
  validationMiddleware(resolverHomologacionSchema),
  homologacionController.resolver
);

export default router;
