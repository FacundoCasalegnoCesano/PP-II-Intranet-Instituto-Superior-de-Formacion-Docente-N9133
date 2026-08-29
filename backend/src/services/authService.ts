import userRepository from '../repositories/userRepository.js';
import alumnoRepository from '../repositories/alumnoRepository.js';
import usuarioRolRepository from '../repositories/usuarioRolRepository.js';
import { hashPassword, comparePassword } from '../utils/bcrypt.js';
import {
  generateAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  type TokenPayload
} from '../utils/jwt.js';
import { sendPasswordResetEmail } from '../utils/email.js';
import passwordResetTokenRepository from '../repositories/passwordResetTokenRepository.js';
import { generatePasswordResetToken, hashPasswordResetToken } from '../utils/passwordResetToken.js';
import { generateBackupCodes, encryptBackupCodes, decryptBackupCodes } from '../utils/backupCodes.js';
import { prisma } from '../config/prisma.js';
import { ROLES } from '../constants/roles.js';
import { toPublicUser } from '../utils/publicUser.js';
import { AppError } from '../utils/AppError.js';

interface RegisterData {
  apellidoNombre: string;
  dni: string;
  email: string;
  fechaNacimiento: Date | string;
  telefono: string;
  password: string;
  cuil: string;
  roles?: string[];
  rol?: string;
  contactoEmergencia?: string | null;
  foto?: string | null;
  domicilio?: string | null;
  anioEgreso?: number | null;
  institucionProcedencia?: string | null;
}

interface PasswordResetOptions {
  sendEmail?: typeof sendPasswordResetEmail;
  now?: () => Date;
}

const PASSWORD_RESET_MESSAGE = 'Si el email existe, recibirás un enlace para recuperar tu contraseña';
const PASSWORD_RESET_COOLDOWN_MS = 60 * 1000;

class AuthService {
  // Registrar usuario (SOLO ADMIN)
  async register(userData: RegisterData) {
    const { email, dni, password, roles, rol, domicilio, anioEgreso, institucionProcedencia, ...rest } = userData;
  
    // Verificar si ya existe
    const existingUser = await userRepository.findByEmailOrDni(email) || 
                         await userRepository.findByEmailOrDni(dni);
  
    if (existingUser) {
      if (existingUser.email === email) {
        throw new Error('El email ya está registrado');
      }
      if (existingUser.dni === parseInt(dni)) {
        throw new Error('El DNI ya está registrado');
      }
    }

    // Hashear contraseña
    const passwordHash = await hashPassword(password);

    // Determinar rol: si roles[] se pasa, unir con coma. Si rol se pasa, usarlo. Default ALUMNO.
    let rolString: string;
    if (roles && roles.length > 0) {
      rolString = roles.join(',');
    } else if (rol) {
      rolString = rol;
    } else {
      rolString = ROLES.ALUMNO;
    }

    // Si el usuario es administrativo, generar sus backup codes cifrados
    const userRolesPreview = rolString.split(',').map((r: string) => r.trim());
    const backupCodesEncrypted = userRolesPreview.includes(ROLES.ADMINISTRATIVO)
      ? encryptBackupCodes(generateBackupCodes(8))
      : null;

    // Crear usuario
    const user = await userRepository.create({
      ...rest,
      email,
      dni,
      passwordHash,
      rol: rolString,
      backupCodes: backupCodesEncrypted
    });

    const publicUser = toPublicUser(user);

    // Devolver roles como array para compatibilidad
    const userRoles = rolString.split(',').map((r: string) => r.trim());

    const result: any = {
      ...publicUser,
      roles: userRoles
    };

    // Si el rol incluye ALUMNO, crear (o actualizar) la ficha del alumno
    if (userRoles.includes(ROLES.ALUMNO)) {
      result.alumno = await alumnoRepository.upsertByUsuarioId(user.idUsuario, {
        domicilio: domicilio ?? null,
        anioEgreso: anioEgreso ?? new Date().getFullYear(),
        institucionProcedencia: institucionProcedencia ?? null
      });
    }

    return result;
  }

  // Login - retorna roles disponibles
  async login(identifier: string, password: string, ipAddress: string | undefined, userAgent: string | undefined) {
    const user = await userRepository.findByEmailOrDni(identifier);
  
    if (!user) {
      throw new Error('Credenciales inválidas');
    }
  
    if (!user.activo) {
      throw new Error('Usuario desactivado. Contacte al administrador');
    }
  
    const isValidPassword = await comparePassword(password, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('Credenciales inválidas');
    }

    // Obtener roles del usuario (string separado por coma)
    const roles = user.rol ? user.rol.split(',').map((r: string) => r.trim()) : [];

    if (roles.length === 0) {
      throw new Error('Usuario sin roles asignados');
    }

    await userRepository.updateLastAccess(user.idUsuario);

    // ✅ Generar token SIN rol (se seleccionará después)
    const payload = {
      id: user.idUsuario,
      email: user.email,
      dni: user.dni.toString(),
      nombre: user.apellidoNombre
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);
    const refreshTokenHash = hashRefreshToken(refreshToken);

    const decodedAccess = verifyAccessToken(accessToken);
    const decodedRefresh = verifyRefreshToken(refreshToken);

    const session = await prisma.sesion.create({
      data: {
        token: accessToken,
        refreshTokenHash,
        refreshTokenExpira: new Date(decodedRefresh.exp! * 1000),
        usuarioId: user.idUsuario,
        expiraEn: new Date(decodedAccess.exp! * 1000),
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      }
    });

    return {
      user: toPublicUser(user),
      roles, // Lista de roles disponibles
      accessToken,
      refreshToken,
      sessionId: session.id
    };
  }

  // Seleccionar rol para la sesión
  async selectRole(userId: number, roleName: string, sessionId: number) {
    // Verificar que el usuario tiene ese rol
    const userRol = await usuarioRolRepository.getRolesByNombre(userId, roleName);
    if (!userRol) {
      throw new Error(`El usuario no tiene el rol ${roleName}`);
    }

    // Obtener usuario
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    // Obtener la sesión actual para la familia
    const session = await prisma.sesion.findUnique({ where: { id: sessionId } });
    if (!session) {
      throw new Error('Sesión no encontrada');
    }

    // ✅ Generar nuevo token CON el rol seleccionado
    const payload = {
      id: user.idUsuario,
      email: user.email,
      dni: user.dni.toString(),
      nombre: user.apellidoNombre,
      rol: roleName,
      familiaId: session.familiaId
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);
    const refreshTokenHash = hashRefreshToken(refreshToken);

    const decodedAccess = verifyAccessToken(accessToken);
    const decodedRefresh = verifyRefreshToken(refreshToken);

    // Rotación: invalidar toda la familia y crear nueva sesión
    await prisma.sesion.updateMany({
      where: { familiaId: session.familiaId, revocadaEn: null },
      data: { revocadaEn: new Date() }
    });

    const newSession = await prisma.sesion.create({
      data: {
        token: accessToken,
        refreshTokenHash,
        refreshTokenExpira: new Date(decodedRefresh.exp! * 1000),
        familiaId: session.familiaId,
        usuarioId: user.idUsuario,
        expiraEn: new Date(decodedAccess.exp! * 1000),
        ipAddress: session.ipAddress ?? null,
        userAgent: session.userAgent ?? null,
      }
    });

    // Obtener los roles del usuario para mostrar
    const userRoles = await usuarioRolRepository.getRolesByUsuario(userId);
    const roles = userRoles.map((ur: any) => ur.rol);

    return {
      accessToken,
      refreshToken,
      sessionId: newSession.id,
      rol: roleName,
      rolesDisponibles: roles
    };
  }

  // Logout - invalida toda la familia de tokens
  async logout(sessionId: number) {
    const session = await prisma.sesion.findUnique({ where: { id: sessionId } });
    if (!session) {
      return { message: 'Sesión ya cerrada' };
    }

    // Invalidar toda la familia
    await prisma.sesion.updateMany({
      where: { familiaId: session.familiaId, revocadaEn: null },
      data: { 
        revocadaEn: new Date(),
        cerradaEn: new Date()
      }
    });

    return { message: 'Sesión cerrada exitosamente' };
  }

// Refresh token con rotación y invalidación de familia
  async refreshToken(refreshToken: string) {
    try {
      const decoded = verifyRefreshToken(refreshToken);
      const user = await userRepository.findById(decoded.id);

      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      if (!user.activo) {
        throw new Error('Usuario desactivado');
      }

      // Buscar la sesión por hash del refresh token
      const refreshTokenHash = hashRefreshToken(refreshToken);
      const session = await prisma.sesion.findFirst({
        where: {
          refreshTokenHash,
          refreshTokenExpira: { gte: new Date() },
          revocadaEn: null
        }
      });

      if (!session) {
        throw new Error('Refresh token inválido o expirado');
      }

      // ✅ Payload mantiene rol y familia
      const payload: TokenPayload = {
        id: user.idUsuario,
        email: user.email,
        dni: user.dni.toString(),
        nombre: user.apellidoNombre,
        rol: decoded.rol,
        familiaId: session.familiaId
      };

      const newAccessToken = generateAccessToken(payload);
      const newRefreshToken = generateRefreshToken(payload);
      const newRefreshTokenHash = hashRefreshToken(newRefreshToken);

      const decodedAccess = verifyAccessToken(newAccessToken);
      const decodedRefresh = verifyRefreshToken(newRefreshToken);

      // Rotación: invalidar TODA la familia (revocadaEn) y crear nueva sesión
      await prisma.sesion.updateMany({
        where: { familiaId: session.familiaId, revocadaEn: null },
        data: { revocadaEn: new Date() }
      });

      await prisma.sesion.create({
        data: {
          token: newAccessToken,
          refreshTokenHash: newRefreshTokenHash,
          refreshTokenExpira: new Date(decodedRefresh.exp! * 1000),
          familiaId: session.familiaId,
          usuarioId: user.idUsuario,
          expiraEn: new Date(decodedAccess.exp! * 1000),
          ipAddress: session.ipAddress ?? null,
          userAgent: session.userAgent ?? null,
        }
      });

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken
      };
    } catch (error) {
      throw new Error('Refresh token inválido o expirado');
    }
  }

  // Obtener perfil (con roles)
  async getProfile(userId: number) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    const userRoles = await usuarioRolRepository.getRolesByUsuario(userId);
    const roles = userRoles.map((ur: any) => ur.rol);

    return {
      ...toPublicUser(user),
      roles
    };
  }

  // Cambiar contraseña
  async changePassword(userId: number, currentPassword: string, newPassword: string) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    const isValidPassword = await comparePassword(currentPassword, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('Contraseña actual incorrecta');
    }

    const newPasswordHash = await hashPassword(newPassword);
    await userRepository.updatePassword(userId, newPasswordHash);

    return { message: 'Contraseña actualizada exitosamente' };
  }

  // Forgot password
  async forgotPassword(email: string, options: PasswordResetOptions = {}) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await userRepository.findByEmail(normalizedEmail);
    const publicResponse = { message: PASSWORD_RESET_MESSAGE };

    if (!user || !user.activo) {
      return publicResponse;
    }

    const now = options.now?.() ?? new Date();
    const recentRequest = await passwordResetTokenRepository.hasRecentRequest(
      user.idUsuario,
      new Date(now.getTime() - PASSWORD_RESET_COOLDOWN_MS)
    );
    if (recentRequest) {
      return publicResponse;
    }

    const resetToken = generatePasswordResetToken();
    const tokenHash = hashPasswordResetToken(resetToken);
    await passwordResetTokenRepository.invalidateForUser(user.idUsuario, now);
    await passwordResetTokenRepository.create({
      usuarioId: user.idUsuario,
      tokenHash,
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000)
    });

    try {
      await (options.sendEmail ?? sendPasswordResetEmail)(user.email, resetToken, user.apellidoNombre);
    } catch (error) {
      try {
        await passwordResetTokenRepository.deleteByHash(tokenHash);
      } catch (cleanupError) {
        console.error('Password reset token cleanup failed', {
          name: cleanupError instanceof Error ? cleanupError.name : 'UnknownError',
          code: typeof (cleanupError as { code?: unknown })?.code === 'string'
            ? (cleanupError as { code: string }).code
            : 'DATABASE_ERROR'
        });
      }
      console.error('Password reset email delivery failed', {
        name: error instanceof Error ? error.name : 'UnknownError',
        code: typeof (error as { code?: unknown })?.code === 'string'
          ? (error as { code: string }).code
          : 'SMTP_ERROR'
      });
    }

    return publicResponse;
  }

  // Reset password
  async resetPassword(token: string, newPassword: string) {
    const tokenHash = hashPasswordResetToken(token);
    const newPasswordHash = await hashPassword(newPassword);

    try {
      await passwordResetTokenRepository.consumeAndReset({ tokenHash, newPasswordHash });
      return { message: 'Contraseña restablecida exitosamente' };
    } catch (error) {
      if (error instanceof Error && error.message === 'Token inválido o expirado') {
        throw new AppError(400, 'Token inválido o expirado');
      }
      throw error;
    }
  }

  // Verify reset token
  async verifyResetToken(token: string) {
    const tokenHash = hashPasswordResetToken(token);
    const resetToken = await passwordResetTokenRepository.findValidByHash(tokenHash);

    if (!resetToken) {
      return { valid: false };
    }

    return { valid: true, email: resetToken.usuario.email };
  }

  // Recovery with backup code (admin only)
  async recoveryWithBackupCode(email: string, code: string, newPassword: string, ip?: string) {
    // 1. Buscar usuario por email
    const user = await userRepository.findByEmail(email);

    // 2. Si no existe O rol no incluye "ADMINISTRATIVO" → throw AppError(401, 'Código inválido')
    if (!user) {
      throw new Error('Código inválido');
    }

    const roles = (user.rol || '').split(',').map((r: string) => r.trim());
    if (!roles.includes('ADMINISTRATIVO')) {
      throw new Error('Código inválido');
    }

    // 3. Desencriptar backupCodes, si null/empty → throw 401
    if (!user.backupCodes) {
      throw new Error('Código inválido');
    }

    let storedCodes: string[];
    try {
      storedCodes = decryptBackupCodes(user.backupCodes);
    } catch {
      throw new Error('Código inválido');
    }

    if (!Array.isArray(storedCodes) || storedCodes.length === 0) {
      throw new Error('Código inválido');
    }

    // 4. Comparar code contra códigos almacenados
    const matchedIndex = storedCodes.indexOf(code);

    // 5. Si no match → throw 401
    if (matchedIndex === -1) {
      throw new Error('Código inválido');
    }

    // 6. Si match → eliminar código usado, guardar array cifrado actualizado
    storedCodes.splice(matchedIndex, 1);
    await userRepository.updateBackupCodes(user.idUsuario, encryptBackupCodes(storedCodes));

    // 7. Validar newPassword (reusar lógica de register - patrón ya validado por Joi)
    const passwordHash = await hashPassword(newPassword);

    // 8. Actualizar passwordHash + activo = true
    await userRepository.updatePasswordAndActivate(user.idUsuario, passwordHash);

    // 9. Invalidar TODA la familia de sesiones
    await prisma.sesion.updateMany({
      where: { usuarioId: user.idUsuario, revocadaEn: null },
      data: {
        revocadaEn: new Date(),
        cerradaEn: new Date()
      }
    });

    // 10. Log auditoría
    console.log(`Admin recovery via backup code: ${email} at ${new Date().toISOString()} IP: ${ip || 'unknown'}`);

    // 11. Return { remainingCodes }
    return { remainingCodes: storedCodes.length };
  }

  // Ver propios backup codes (requiere re-ingresar contraseña)
  async revealMyBackupCodes(userId: number, currentPassword: string) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    const isValid = await comparePassword(currentPassword, user.passwordHash);
    if (!isValid) {
      console.log(`[AUDIT] Failed backup codes reveal attempt: userId=${userId} at ${new Date().toISOString()}`);
      throw new Error('Contraseña incorrecta');
    }

    const roles = (user.rol || '').split(',').map((r: string) => r.trim());
    if (!roles.includes('ADMINISTRATIVO')) {
      throw new Error('Solo disponible para administrativos');
    }

    if (!user.backupCodes) {
      throw new Error('No tienes códigos de respaldo generados');
    }

    let codes: string[];
    try {
      codes = decryptBackupCodes(user.backupCodes);
    } catch {
      throw new Error('Error al leer los códigos. Regenerálos desde la opción correspondiente.');
    }

    console.log(`[AUDIT] Backup codes revealed: userId=${userId} at ${new Date().toISOString()}`);

    return { codes };
  }

  // Regenerar propios backup codes (invalida los anteriores, requiere contraseña)
  async regenerateMyBackupCodes(userId: number, currentPassword: string) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    const isValid = await comparePassword(currentPassword, user.passwordHash);
    if (!isValid) {
      console.log(`[AUDIT] Failed backup codes regeneration attempt: userId=${userId} at ${new Date().toISOString()}`);
      throw new Error('Contraseña incorrecta');
    }

    const roles = (user.rol || '').split(',').map((r: string) => r.trim());
    if (!roles.includes('ADMINISTRATIVO')) {
      throw new Error('Solo disponible para administrativos');
    }

    const newCodes = generateBackupCodes(8);
    await userRepository.updateBackupCodes(user.idUsuario, encryptBackupCodes(newCodes));

    console.log(`[AUDIT] Backup codes regenerated: userId=${userId} at ${new Date().toISOString()}`);

    return { codes: newCodes };
  }
}

export default new AuthService();
