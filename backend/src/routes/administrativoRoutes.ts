import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import administrativoController from '../controllers/administrativoController.js';
import { authMiddleware, roleCheck } from '../middleware/auth.js';
import { validationMiddleware } from '../middleware/validation.js';
import { updateUserSchema, listUsersSchema } from '../validations/userValidation.js';
import { registerSchema } from '../validations/authValidation.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// Solo admin puede ver administrativos
router.get('/',
  roleCheck(ROLES.ADMINISTRATIVO),
  validationMiddleware(listUsersSchema, 'query'),
  administrativoController.listarAdministrativos
);

router.get('/estadisticas',
  roleCheck(ROLES.ADMINISTRATIVO),
  administrativoController.estadisticasAdministrativos
);

// Rutas solo para admin
router.post('/',
  roleCheck(ROLES.ADMINISTRATIVO),
  validationMiddleware(registerSchema),
  administrativoController.crearAdministrativo
);

router.put('/:id',
  roleCheck(ROLES.ADMINISTRATIVO),
  validationMiddleware(updateUserSchema),
  administrativoController.actualizarAdministrativo
);

router.delete('/:id',
  roleCheck(ROLES.ADMINISTRATIVO),
  administrativoController.eliminarAdministrativo
);

// Middleware para verificar permisos
const checkAdminOrSelf = (req: Request, res: Response, next: NextFunction): void => {
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

  if (req.user?.rol === ROLES.ADMINISTRATIVO || req.user?.id === userId) {
    next();
  } else {
    res.status(403).json({
      success: false,
      message: 'No tienes permisos para ver este administrativo'
    });
  }
};

// Rutas para admin o el mismo administrativo
router.get('/:id',
  checkAdminOrSelf,
  administrativoController.obtenerAdministrativo
);

export default router;