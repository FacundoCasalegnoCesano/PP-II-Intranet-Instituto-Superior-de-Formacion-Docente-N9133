import { Router } from 'express';
import authController from '../controllers/authController.js';
import { authMiddleware, roleCheck } from '../middleware/auth.js';
import { validationMiddleware } from '../middleware/validation.js';
import {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema
} from '../validations/authValidation.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

// Rutas públicas
router.post('/login', validationMiddleware(loginSchema), authController.login);
router.post('/select-role', authMiddleware, authController.selectRole); // Seleccionar rol después de login
router.post('/forgot-password', validationMiddleware(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', validationMiddleware(resetPasswordSchema), authController.resetPassword);
router.get('/verify-reset-token/:token', authController.verifyResetToken);

// Rutas protegidas (requieren autenticación y rol seleccionado)
router.post('/logout', authMiddleware, authController.logout);
router.post('/refresh-token', authController.refreshToken);
router.get('/me', authMiddleware, authController.getProfile);
router.put('/change-password', 
  authMiddleware,
  validationMiddleware(changePasswordSchema),
  authController.changePassword
);

// Rutas solo para administradores
router.post('/register', 
  authMiddleware,
  roleCheck(ROLES.ADMINISTRATIVO),
  validationMiddleware(registerSchema),
  authController.register
);

export default router;