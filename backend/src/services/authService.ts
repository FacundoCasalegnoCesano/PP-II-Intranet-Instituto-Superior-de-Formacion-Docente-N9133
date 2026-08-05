import userRepository from '../repositories/userRepository.js';
import usuarioRolRepository from '../repositories/usuarioRolRepository.js';
import { hashPassword, comparePassword } from '../utils/bcrypt.js';
import { generateToken, generateRefreshToken, verifyToken, type TokenPayload } from '../utils/jwt.js';
import { sendPasswordResetEmail } from '../utils/email.js';
import { prisma } from '../config/prisma.js';
import config from '../config/env.js';
import jwt from 'jsonwebtoken';
import { ROLES } from '../constants/roles.js';

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
}

class AuthService {
  // Registrar usuario (SOLO ADMIN)
  async register(userData: RegisterData) {
    const { email, dni, password, roles, rol, ...rest } = userData;

    // Verificar si ya existe
    const existingUser = await userRepository.findByEmailOrDni(email) || 
                         await userRepository.findByEmailOrDni(dni);
    
    if (existingUser) {
      if (existingUser.email === email) {
        throw new Error('El email ya está registrado');
      }
      if (existingUser.dni === dni) {
        throw new Error('El DNI ya está registrado');
      }
    }

    // Hashear contraseña
    const passwordHash = await hashPassword(password);

    // Crear usuario (sin rol, ahora es multi-rol)
    const user = await userRepository.create({
      ...rest,
      email,
      dni,
      passwordHash
    });

    // Asignar roles
    const rolesToAssign = roles && roles.length > 0 ? roles : (rol ? [rol] : [ROLES.ALUMNO]);
    
    for (const rolNombre of rolesToAssign) {
      await usuarioRolRepository.asignarRol(user.id, rolNombre);
    }

    const { passwordHash: _, ...userWithoutPassword } = user;
    const userRoles = await usuarioRolRepository.getRolesByUsuario(user.id);
    
    return {
      ...userWithoutPassword,
      roles: userRoles.map((ur: any) => ur.rol)
    };
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

    // Obtener roles del usuario
    const userRoles = await usuarioRolRepository.getRolesByUsuario(user.id);
    const roles = userRoles.map((ur: any) => ur.rol);

    if (roles.length === 0) {
      throw new Error('Usuario sin roles asignados');
    }

    await userRepository.updateLastAccess(user.id);

    // ✅ Generar token SIN rol (se seleccionará después)
    // Usamos 'as any' para evitar el error de TypeScript
    const payload = {
      id: user.id,
      email: user.email,
      dni: user.dni,
      nombre: user.apellidoNombre
    };

    const token = generateToken(payload as any);
    const refreshToken = generateRefreshToken(payload as any);

    const decodedToken = verifyToken(token);
    const session = await prisma.sesion.create({
      data: {
        token,
        usuarioId: user.id,
        expiraEn: new Date((decodedToken.exp || Date.now() / 1000 + 86400) * 1000),
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      }
    });

    const { passwordHash: _, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      roles, // Lista de roles disponibles
      token, // Token sin rol
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

    // ✅ Generar nuevo token CON el rol seleccionado
    const payload = {
      id: user.id,
      email: user.email,
      dni: user.dni,
      nombre: user.apellidoNombre,
      rol: roleName
    };

    const token = generateToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // Actualizar la sesión existente con el nuevo token
    await prisma.sesion.update({
      where: { id: sessionId },
      data: { token }
    });

    // Obtener los roles del usuario para mostrar
    const userRoles = await usuarioRolRepository.getRolesByUsuario(userId);
    const roles = userRoles.map((ur: any) => ur.rol);

    return {
      token,
      refreshToken,
      sessionId,
      rol: roleName,
      rolesDisponibles: roles
    };
  }

  // Logout
  async logout(sessionId: number) {
    await prisma.sesion.update({
      where: { id: sessionId },
      data: { cerradaEn: new Date() }
    });

    return { message: 'Sesión cerrada exitosamente' };
  }

  // Refresh token
  async refreshToken(refreshToken: string) {
    try {
      const decoded = verifyToken(refreshToken);
      const user = await userRepository.findById(decoded.id);
      
      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      if (!user.activo) {
        throw new Error('Usuario desactivado');
      }

      // ✅ Crear payload manteniendo el rol si existe
      const payload: any = {
        id: user.id,
        email: user.email,
        dni: user.dni,
        nombre: user.apellidoNombre
      };

      // Si el token original tenía rol, mantenerlo
      if (decoded.rol) {
        payload.rol = decoded.rol;
      }

      const newToken = generateToken(payload);
      const newRefreshToken = generateRefreshToken(payload);

      await prisma.sesion.updateMany({
        where: {
          token: refreshToken,
          cerradaEn: null
        },
        data: { cerradaEn: new Date() }
      });

      return {
        token: newToken,
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

    const { passwordHash: _, ...userWithoutPassword } = user;
    return {
      ...userWithoutPassword,
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
  async forgotPassword(email: string) {
    const user = await userRepository.findByEmail(email);
    if (!user) {
      return { 
        message: 'Si el email existe, recibirás un enlace para recuperar tu contraseña' 
      };
    }

    const resetPayload = {
      id: user.id,
      email: user.email,
      type: 'password_reset'
    };
    const resetToken = jwt.sign(resetPayload, config.jwtSecret, { expiresIn: '1h' });

    await sendPasswordResetEmail(user.email, resetToken, user.apellidoNombre);

    return { 
      message: 'Si el email existe, recibirás un enlace para recuperar tu contraseña' 
    };
  }

  // Reset password
  async resetPassword(token: string, newPassword: string) {
    try {
      const decoded = verifyToken(token);
      
      if (decoded.type !== 'password_reset') {
        throw new Error('Token inválido');
      }

      const user = await userRepository.findById(decoded.id);
      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      const newPasswordHash = await hashPassword(newPassword);
      await userRepository.updatePassword(user.id, newPasswordHash);

      await prisma.sesion.updateMany({
        where: {
          usuarioId: user.id,
          cerradaEn: null
        },
        data: { cerradaEn: new Date() }
      });

      return { message: 'Contraseña restablecida exitosamente' };
    } catch (error) {
      throw new Error('Token inválido o expirado');
    }
  }

  // Verify reset token
  async verifyResetToken(token: string) {
    try {
      const decoded = verifyToken(token);
      if (decoded.type !== 'password_reset') {
        throw new Error('Token inválido');
      }
      return { valid: true, email: decoded.email };
    } catch (error) {
      return { valid: false, error: (error as Error).message };
    }
  }
}

export default new AuthService();