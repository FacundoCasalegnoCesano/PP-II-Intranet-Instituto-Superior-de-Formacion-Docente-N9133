import userRepository from '../repositories/userRepository.js';
import usuarioRolRepository from '../repositories/usuarioRolRepository.js';
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
    const userRoles = await usuarioRolRepository.getRolesByUsuario(id);
    const roles = userRoles.map((ur: any) => ur.rol.nombre);
    
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
    if (userData.dni && userData.dni !== user.dni) {
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
    const userRoles = await usuarioRolRepository.getRolesByUsuario(id);
    const roles = userRoles.map((ur: any) => ur.rol.nombre);
    
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

    // Verificar que el rol existe
    const rolId = await usuarioRolRepository.getRolIdByNombre(newRole);
    if (!rolId) {
      throw new Error('Rol inválido');
    }

    // Verificar si ya tiene el rol
    const existingRol = await usuarioRolRepository.getRolesByNombre(id, newRole);
    if (existingRol) {
      throw new Error(`El usuario ya tiene el rol ${newRole}`);
    }

    // Asignar nuevo rol (se agrega, no reemplaza)
    await usuarioRolRepository.asignarRol(id, rolId);

    // Obtener usuario actualizado
    const updatedUser = await userRepository.findById(id);
    const userRoles = await usuarioRolRepository.getRolesByUsuario(id);
    const roles = userRoles.map((ur: any) => ur.rol.nombre);
    
    const { passwordHash: _, ...userWithoutPassword } = updatedUser!;
    return {
      ...userWithoutPassword,
      roles
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

    // Verificar que el rol existe
    const rolId = await usuarioRolRepository.getRolIdByNombre(roleToRemove);
    if (!rolId) {
      throw new Error('Rol inválido');
    }

    // Verificar que tenga el rol
    const existingRol = await usuarioRolRepository.getRolesByNombre(id, roleToRemove);
    if (!existingRol) {
      throw new Error(`El usuario no tiene el rol ${roleToRemove}`);
    }

    // No permitir quitar el último rol
    const userRoles = await usuarioRolRepository.getRolesByUsuario(id);
    if (userRoles.length <= 1) {
      throw new Error('El usuario debe tener al menos un rol');
    }

    // Quitar rol
    await usuarioRolRepository.removerRol(id, rolId);

    // Obtener usuario actualizado
    const updatedUser = await userRepository.findById(id);
    const rolesActualizados = await usuarioRolRepository.getRolesByUsuario(id);
    const roles = rolesActualizados.map((ur: any) => ur.rol.nombre);
    
    const { passwordHash: _, ...userWithoutPassword } = updatedUser!;
    return {
      ...userWithoutPassword,
      roles
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
    const userRoles = await usuarioRolRepository.getRolesByUsuario(id);
    const roles = userRoles.map((ur: any) => ur.rol.nombre);
    
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

    // Eliminar roles del usuario primero
    await prisma.usuarioRol.deleteMany({
      where: { usuarioId: id }
    });

    // Eliminar sesiones del usuario
    await prisma.sesion.deleteMany({
      where: { usuarioId: id }
    });

    await userRepository.delete(id);
    return { message: 'Usuario eliminado exitosamente' };
  }
}

export default new UserService();