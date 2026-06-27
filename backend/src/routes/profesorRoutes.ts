import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import profesorController from '../controllers/profesorController.js';
import { authMiddleware, roleCheck } from '../middleware/auth.js';
import { validationMiddleware } from '../middleware/validation.js';
import { updateUserSchema, listUsersSchema } from '../validations/userValidation.js';
import { registerSchema } from '../validations/authValidation.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// Rutas para admin (pueden ver todos los profesores)
router.get('/',
  roleCheck(ROLES.ADMINISTRATIVO),
  validationMiddleware(listUsersSchema, 'query'),
  profesorController.listarProfesores
);

router.get('/estadisticas',
  roleCheck(ROLES.ADMINISTRATIVO),
  profesorController.estadisticasProfesores
);

// Rutas solo para admin
router.post('/',
  roleCheck(ROLES.ADMINISTRATIVO),
  validationMiddleware(registerSchema),
  profesorController.crearProfesor
);

router.put('/:id',
  roleCheck(ROLES.ADMINISTRATIVO),
  validationMiddleware(updateUserSchema),
  profesorController.actualizarProfesor
);

router.delete('/:id',
  roleCheck(ROLES.ADMINISTRATIVO),
  profesorController.eliminarProfesor
);

// Obtener materias asignadas a un profesor (solo admin)
router.get('/:id/materias',
  roleCheck(ROLES.ADMINISTRATIVO),
  profesorController.obtenerMateriasAsignadas
);

// Middleware para verificar permisos
const checkProfesorPermissions = (req: Request, res: Response, next: NextFunction): void => {
  const idParam = req.params.id;
  if (!idParam) {
    res.status(400).json({
      success: false,
      message: 'ID de usuario no proporcionado'
    });
    return;
  }

  const userId = parseInt(idParam);
  if (isNaN(userId)) {
    res.status(400).json({
      success: false,
      message: 'ID de usuario inválido'
    });
    return;
  }

  // Admin o el mismo profesor pueden ver
  if (req.user?.rol === ROLES.ADMINISTRATIVO || req.user?.id === userId) {
    next();
  } else {
    res.status(403).json({
      success: false,
      message: 'No tienes permisos para ver este profesor'
    });
  }
};

// Rutas para admin o el mismo profesor
router.get('/:id',
  checkProfesorPermissions,
  profesorController.obtenerProfesor
);

export default router;