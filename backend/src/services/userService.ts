import userRepository from '../repositories/userRepository.js';
import { hashPassword } from '../utils/bcrypt.js';
import { ROLES } from '../constants/roles.js';
import { prisma } from '../config/prisma.js';

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
}

interface CurrentUser {
  id: number;
  email: string;
  dni: string;
  rol: string;
  nombre: string;
}

class UserService {
  async listUsers(filters: UserFilters = {}) {
    return await userRepository.findAll(filters);
  }

  async getUserById(id: number) {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new Error('Usuario no encontrado');
    }
  
    // Obtener roles del usuario
    const roles = user.rol ? user.rol.split(',').map((r: string) => r.trim()) : [];
  
    const { passwordHash: _, ...userWithoutPassword } = user;
    return {
      ...userWithoutPassword,
      roles
    };
  }

  async updateUser(id: number, userData: UserUpdateData, currentUser: CurrentUser) {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new Error('Usuario no encontrado');
    }
  
    // Verificar permisos
    if (currentUser.rol !== ROLES.ADMINISTRATIVO && currentUser.id !== id) {
      throw new Error('No tienes permisos para actualizar este usuario');
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
    const updateData: any = { ...userData };
    if (updateData.password) {
      updateData.passwordHash = await hashPassword(updateData.password);
      delete updateData.password;
    }
  
    const updatedUser = await userRepository.update(id, updateData);
    const { passwordHash: _, ...userWithoutPassword } = updatedUser;
  
    // Obtener roles actualizados
    const roles = updatedUser.rol ? updatedUser.rol.split(',').map((r: string) => r.trim()) : [];
  
    return {
      ...userWithoutPassword,
      roles
    };
  }

  // ✅ NUEVO MÉTODO: Cambiar rol de usuario
  async changeUserRole(id: number, newRole: string, currentUser: CurrentUser) {
    if (currentUser.rol !== ROLES.ADMINISTRATIVO) {
      throw new Error('Solo los administradores pueden cambiar roles');
    }

    const user = await userRepository.findById(id);
    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    // Verificar si ya tiene el rol
    const currentRoles = user.rol ? user.rol.split(',').map((r: string) => r.trim()) : [];
    if (currentRoles.includes(newRole)) {
      throw new Error(`El usuario ya tiene el rol ${newRole}`);
    }

    // Agregar rol (se agrega, no reemplaza)
    const updatedRoles = [...currentRoles, newRole];
    await userRepository.update(id, { rol: updatedRoles.join(',') });
  
    // Obtener usuario actualizado
    const updatedUser = await userRepository.findById(id);
    const { passwordHash: _, ...userWithoutPassword } = updatedUser!;
    return {
      ...userWithoutPassword,
      roles: updatedRoles
    };
  }

  // ✅ NUEVO MÉTODO: Quitar rol de usuario
  async removeUserRole(id: number, roleToRemove: string, currentUser: CurrentUser) {
    if (currentUser.rol !== ROLES.ADMINISTRATIVO) {
      throw new Error('Solo los administradores pueden cambiar roles');
    }

    const user = await userRepository.findById(id);
    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    // Verificar que tenga el rol
    const currentRoles = user.rol ? user.rol.split(',').map((r: string) => r.trim()) : [];
    if (!currentRoles.includes(roleToRemove)) {
      throw new Error(`El usuario no tiene el rol ${roleToRemove}`);
    }

    // No permitir quitar el último rol
    if (currentRoles.length <= 1) {
      throw new Error('El usuario debe tener al menos un rol');
    }

    // Quitar rol
    const updatedRoles = currentRoles.filter((r: string) => r !== roleToRemove);
    await userRepository.update(id, { rol: updatedRoles.join(',') });
  
    // Obtener usuario actualizado
    const updatedUser = await userRepository.findById(id);
    const { passwordHash: _, ...userWithoutPassword } = updatedUser!;
    return {
      ...userWithoutPassword,
      roles: updatedRoles
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
    const { passwordHash: _, ...userWithoutPassword } = updatedUser;
  
    // Obtener roles actualizados
    const roles = updatedUser.rol ? updatedUser.rol.split(',').map((r: string) => r.trim()) : [];
  
    return {
      ...userWithoutPassword,
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

    // Eliminar sesiones del usuario
    await prisma.sesion.deleteMany({
      where: { usuarioId: id }
    });

    await userRepository.delete(id);
    return { message: 'Usuario eliminado exitosamente' };
  }
}

export default new UserService();