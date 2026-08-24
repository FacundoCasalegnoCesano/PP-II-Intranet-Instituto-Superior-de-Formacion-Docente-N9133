import { Router } from 'express';
import authController from '../controllers/authController.js';
import { authMiddleware, authOnly, roleCheck } from '../middleware/auth.js';
import { validationMiddleware } from '../middleware/validation.js';
import {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  backupCodeSchema,
  backupCodesActionSchema
} from '../validations/authValidation.js';
import { ROLES } from '../constants/roles.js';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limiter específico para backup codes (5 req/hora por IP)
const backupCodeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 5,
  message: { success: false, message: 'Demasiados intentos. Intente en 1 hora.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter para ver/regenerar propios códigos (10 req/15 min)
const backupCodesActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Demasiados intentos. Intente más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rutas públicas
router.post('/login', validationMiddleware(loginSchema), authController.login);
router.post('/select-role', authOnly, authController.selectRole); // Seleccionar rol después de login
router.post('/forgot-password', validationMiddleware(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', validationMiddleware(resetPasswordSchema), authController.resetPassword);
router.get('/verify-reset-token/:token', authController.verifyResetToken);

// Backup code recovery (admin only, público pero rate-limited)
router.post('/admin/backup-code',
  backupCodeLimiter,
  validationMiddleware(backupCodeSchema),
  authController.recoveryWithBackupCode
);

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

// Gestión de propios backup codes (solo administrativos, requiere contraseña)
router.post('/my-backup-codes/reveal',
  authMiddleware,
  roleCheck(ROLES.ADMINISTRATIVO),
  backupCodesActionLimiter,
  validationMiddleware(backupCodesActionSchema),
  authController.revealMyBackupCodes
);

router.post('/my-backup-codes/regenerate',
  authMiddleware,
  roleCheck(ROLES.ADMINISTRATIVO),
  backupCodesActionLimiter,
  validationMiddleware(backupCodesActionSchema),
  authController.regenerateMyBackupCodes
);

export default router;
