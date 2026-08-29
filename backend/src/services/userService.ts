import userRepository from '../repositories/userRepository.js';
import alumnoRepository from '../repositories/alumnoRepository.js';
import { hashPassword } from '../utils/bcrypt.js';
import { ROLES, ROLES_LIST } from '../constants/roles.js';
import { prisma } from '../config/prisma.js';
import { toPublicUser } from '../utils/publicUser.js';
import { AppError } from '../utils/AppError.js';
import { encryptBackupCodes, generateBackupCodes } from '../utils/backupCodes.js';

interface AlumnoProfileInput {
  domicilio: string;
  anioEgreso: number;
  institucionProcedencia?: string | null;
}

interface UserFilters {
  page?: number;
  limit?: number;
  rol?: string;
  activo?: string;
  search?: string;
}

interface UserUpdateData {
  apellidoNombre?: string;
  dni?: string;
  email?: string;
  fechaNacimiento?: Date | string;
  telefono?: string;
  password?: string;
  cuil?: string;
  contactoEmergencia?: string | null;
  foto?: string | null;
  activo?: boolean;
  backupCodes?: string | null;
  alumno?: AlumnoProfileInput;
}

interface CurrentUser {
  id: number;
  email: string;
  dni: string;
  rol: string;
  nombre: string;
}

class UserService {
  private async revokeAllSessions(userId: number) {
    await prisma.sesion.updateMany({
      where: { usuarioId: userId, revocadaEn: null },
      data: { revocadaEn: new Date(), cerradaEn: new Date() }
    });
  }

  async listUsers(filters: UserFilters = {}) {
    return await userRepository.findAll(filters);
  }

  async listAlumnosForProfesor(filters: { page?: number; limit?: number; search?: string }, profesorId: number) {
    return await userRepository.findAlumnosForProfesor(filters, profesorId);
  }

  async alumnoVisibleParaProfesor(usuarioId: number, profesorId: number): Promise<boolean> {
    return await userRepository.alumnoVisibleParaProfesor(usuarioId, profesorId);
  }

  async getUserById(id: number) {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new AppError(404, 'Usuario no encontrado');
    }
  
    // Obtener roles del usuario
    const roles = user.rol ? user.rol.split(',').map((r: string) => r.trim()) : [];
  
    return {
      ...toPublicUser(user),
      roles,
      alumno: user.alumno ?? null
    };
  }

  async updateUser(id: number, userData: UserUpdateData, currentUser: CurrentUser) {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new AppError(404, 'Usuario no encontrado');
    }
  
    // Verificar permisos
    if (currentUser.rol !== ROLES.ADMINISTRATIVO && currentUser.id !== id) {
      throw new AppError(403, 'No tienes permisos para actualizar este usuario');
    }

    if (currentUser.rol !== ROLES.ADMINISTRATIVO) {
      const protectedFields = ['rol', 'activo', 'password', 'passwordHash', 'backupCodes', 'alumno'];
      const attempted = protectedFields.filter(field => Object.prototype.hasOwnProperty.call(userData, field));
      if (attempted.length > 0) {
        throw new AppError(403, 'No puedes modificar campos administrativos desde tu perfil');
      }
    }
  
    // Verificar email único
    if (userData.email && userData.email !== user.email) {
      const existingEmail = await userRepository.findByEmail(userData.email);
      if (existingEmail) {
        throw new Error('El email ya está en uso');
      }
    }
  
    // Verificar DNI único
    if (userData.dni && userData.dni !== (user.dni ?? 0).toString()) {
      const existingDni = await userRepository.findByDni(userData.dni);
      if (existingDni) {
        throw new Error('El DNI ya está en uso');
      }
    }
  
    // Si se actualiza contraseña
    const { alumno, ...commonData } = userData;
    const updateData: any = { ...commonData };
    if (updateData.password) {
      updateData.passwordHash = await hashPassword(updateData.password);
      delete updateData.password;
    }
  
    const updatedUser = await userRepository.update(id, updateData);
    let updatedAlumno = user.alumno ?? null;
    if (alumno !== undefined) {
      const currentRoles = user.rol ? user.rol.split(',').map((role: string) => role.trim()) : [];
      if (!updatedAlumno && !currentRoles.includes(ROLES.ALUMNO)) {
        throw new AppError(400, 'La ficha Alumno solo puede editarse para una cuenta con ese perfil');
      }
      updatedAlumno = await alumnoRepository.upsertByUsuarioId(id, alumno);
    }
    // Obtener roles actualizados
    const roles = updatedUser.rol ? updatedUser.rol.split(',').map((r: string) => r.trim()) : [];
  
    return {
      ...toPublicUser(updatedUser),
      roles,
      alumno: updatedAlumno
    };
  }

  // ✅ NUEVO MÉTODO: Cambiar rol de usuario
  async changeUserRole(
    id: number,
    newRole: string,
    currentUser: CurrentUser,
    alumnoData?: AlumnoProfileInput
  ) {
    if (currentUser.rol !== ROLES.ADMINISTRATIVO) {
      throw new AppError(403, 'Solo los administradores pueden cambiar roles');
    }
    if (!ROLES_LIST.includes(newRole as any)) {
      throw new AppError(400, 'Rol inválido');
    }

    const user = await userRepository.findById(id);
    if (!user) {
      throw new AppError(404, 'Usuario no encontrado');
    }

    // Verificar si ya tiene el rol
    const currentRoles = user.rol ? user.rol.split(',').map((r: string) => r.trim()) : [];
    if (currentRoles.includes(newRole)) {
      throw new AppError(400, `El usuario ya tiene el rol ${newRole}`);
    }

    let alumno = user.alumno ?? null;
    if (newRole === ROLES.ALUMNO) {
      if (!alumno && !alumnoData) {
        throw new AppError(400, 'La ficha Alumno es obligatoria porque no existe una preservada');
      }
      if (alumnoData) {
        alumno = await alumnoRepository.upsertByUsuarioId(id, alumnoData);
      }
    }

    // Agregar rol (se agrega, no reemplaza)
    const updatedRoles = [...currentRoles, newRole];
    const securityData = newRole === ROLES.ADMINISTRATIVO
      ? { backupCodes: encryptBackupCodes(generateBackupCodes(8)) }
      : {};
    const updatedUser = await userRepository.update(id, {
      rol: updatedRoles.join(','),
      ...securityData
    });
    await this.revokeAllSessions(id);

    return {
      ...toPublicUser(updatedUser),
      roles: updatedRoles,
      alumno
    };
  }

  // ✅ NUEVO MÉTODO: Quitar rol de usuario
  async removeUserRole(id: number, roleToRemove: string, currentUser: CurrentUser) {
    if (currentUser.rol !== ROLES.ADMINISTRATIVO) {
      throw new AppError(403, 'Solo los administradores pueden cambiar roles');
    }

    const user = await userRepository.findById(id);
    if (!user) {
      throw new AppError(404, 'Usuario no encontrado');
    }

    if (!ROLES_LIST.includes(roleToRemove as any)) {
      throw new AppError(400, 'Rol inválido');
    }

    // Verificar que tenga el rol
    const currentRoles = user.rol ? user.rol.split(',').map((r: string) => r.trim()) : [];
    if (!currentRoles.includes(roleToRemove)) {
      throw new AppError(400, `El usuario no tiene el rol ${roleToRemove}`);
    }

    // No permitir quitar el último rol
    if (currentRoles.length <= 1) {
      throw new AppError(400, 'El usuario debe tener al menos un rol');
    }

    if (currentUser.id === id && roleToRemove === ROLES.ADMINISTRATIVO) {
      throw new AppError(403, 'No puedes quitarte el rol administrativo durante tu sesión');
    }

    // Quitar rol
    const updatedRoles = currentRoles.filter((r: string) => r !== roleToRemove);
    const updatedUser = await userRepository.update(id, {
      rol: updatedRoles.join(','),
      ...(roleToRemove === ROLES.ADMINISTRATIVO ? { backupCodes: null } : {})
    });
    await this.revokeAllSessions(id);

    return {
      ...toPublicUser(updatedUser),
      roles: updatedRoles,
      alumno: user.alumno ?? null
    };
  }

  async toggleUserActive(id: number, active: boolean, currentUser: CurrentUser) {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    if (currentUser.id === id && !active) {
      throw new Error('No puedes desactivar tu propia cuenta');
    }

    if (currentUser.rol !== ROLES.ADMINISTRATIVO) {
      throw new Error('No tienes permisos para realizar esta acción');
    }

    const updatedUser = await userRepository.toggleActive(id, active);
    if (!active) {
      await this.revokeAllSessions(id);
    }
    // Obtener roles actualizados
    const roles = updatedUser.rol ? updatedUser.rol.split(',').map((r: string) => r.trim()) : [];
  
    return {
      ...toPublicUser(updatedUser),
      roles
    };
  }

  async deleteUser(id: number, currentUser: CurrentUser) {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    if (currentUser.id === id) {
      throw new Error('No puedes eliminar tu propia cuenta');
    }

    if (currentUser.rol !== ROLES.ADMINISTRATIVO) {
      throw new Error('No tienes permisos para realizar esta acción');
    }

    await userRepository.toggleActive(id, false);
    await this.revokeAllSessions(id);
    return { message: 'Usuario desactivado exitosamente' };
  }
}

export default new UserService();
