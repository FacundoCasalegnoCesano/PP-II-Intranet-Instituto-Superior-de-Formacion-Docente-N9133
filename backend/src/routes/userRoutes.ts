import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import UserController from '../controllers/userController.js';
import { authMiddleware, roleCheck } from '../middleware/auth.js';
import { validationMiddleware } from '../middleware/validation.js';
import { updateUserSchema, listUsersSchema } from '../validations/userValidation.js';
import { ROLES } from '../constants/roles.js';

const router = Router();
const userController = new UserController();

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// Rutas solo para administradores
router.get('/', 
  roleCheck(ROLES.ADMINISTRATIVO),
  validationMiddleware(listUsersSchema, 'query'),
  userController.listUsers
);

router.put('/:id/role',
  roleCheck(ROLES.ADMINISTRATIVO),
  userController.changeUserRole
);

router.put('/:id/activate',
  roleCheck(ROLES.ADMINISTRATIVO),
  userController.toggleUserActive
);

router.delete('/:id',
  roleCheck(ROLES.ADMINISTRATIVO),
  userController.deleteUser
);

// Middleware para verificar permisos
const allowSelfOrAdmin = (req: Request, res: Response, next: NextFunction): void => {
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
      message: 'No tienes permisos para acceder a este recurso'
    });
  }
};

// Rutas para administradores o el mismo usuario
router.get('/:id',
  allowSelfOrAdmin,
  userController.getUserById
);

router.put('/:id',
  allowSelfOrAdmin,
  validationMiddleware(updateUserSchema),
  userController.updateUser
);

export default router;