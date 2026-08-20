import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import alumnoController from '../controllers/alumnoController.js';
import { authMiddleware, roleCheck } from '../middleware/auth.js';
import { validationMiddleware } from '../middleware/validation.js';
import { updateUserSchema, listUsersSchema } from '../validations/userValidation.js';
import { registerSchema } from '../validations/authValidation.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// Rutas para admin y profesores (pueden ver alumnos)
router.get('/',
  roleCheck(ROLES.ADMINISTRATIVO, ROLES.PROFESOR),
  validationMiddleware(listUsersSchema, 'query'),
  alumnoController.listarAlumnos
);

router.get('/estadisticas',
  roleCheck(ROLES.ADMINISTRATIVO),
  alumnoController.estadisticasAlumnos
);

// Rutas solo para admin
router.post('/',
  roleCheck(ROLES.ADMINISTRATIVO),
  validationMiddleware(registerSchema),
  alumnoController.crearAlumno
);

router.put('/:id',
  roleCheck(ROLES.ADMINISTRATIVO),
  validationMiddleware(updateUserSchema),
  alumnoController.actualizarAlumno
);

router.delete('/:id',
  roleCheck(ROLES.ADMINISTRATIVO),
  alumnoController.eliminarAlumno
);

// Middleware para verificar permisos
const checkAlumnoPermissions = (req: Request, res: Response, next: NextFunction): void => {
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

  // Admin, profesor o el mismo alumno pueden ver
  if (req.user?.rol === ROLES.ADMINISTRATIVO || 
      req.user?.rol === ROLES.PROFESOR ||
      req.user?.id === userId) {
    next();
  } else {
    res.status(403).json({
      success: false,
      message: 'No tienes permisos para ver este alumno'
    });
  }
};

// Rutas para admin, profesor o el mismo alumno
router.get('/:id',
  checkAlumnoPermissions,
  alumnoController.obtenerAlumno
);

export default router;