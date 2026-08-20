// El schema Prisma actual NO tiene tabla `usuarioRol`.
// Los roles son un string (coma-separado) directamente en Usuario.rol.
// Este repositorio se mantiene como facade que opera sobre UserRepository.

import userRepository from './userRepository.js';

class UsuarioRolRepository {
  // Para compatibilidad con código que espera roles como array
  // En el nuevo modelo, Usuario.rol es "ALUMNO,PROFESOR" → split()
  async getRolesByUsuario(usuarioId: number): Promise<Array<{ rol: string }>> {
    const user = await userRepository.findById(usuarioId);
    if (!user || !user.rol) return [];
    return user.rol.split(',').map((r: string) => ({ rol: r.trim() }));
  }

  async getRolesByNombre(usuarioId: number, rol: string): Promise<any> {
    const user = await userRepository.findById(usuarioId);
    if (!user || !user.rol) return null;
    const roles = user.rol.split(',').map((r: string) => r.trim());
    return roles.includes(rol) ? { rol } : null;
  }

  // No-ops o delegan: los roles se actualizan como string en Usuario.rol
  async asignarRol(usuarioId: number, rol: string): Promise<any> {
    const user = await userRepository.findById(usuarioId);
    if (!user) throw new Error('Usuario no encontrado');
    const currentRoles = user.rol ? user.rol.split(',').map((r: string) => r.trim()) : [];
    if (!currentRoles.includes(rol)) {
      currentRoles.push(rol);
    }
    return await userRepository.update(usuarioId, { rol: currentRoles.join(',') });
  }

  async removerRol(usuarioId: number, rol: string): Promise<any> {
    const user = await userRepository.findById(usuarioId);
    if (!user) throw new Error('Usuario no encontrado');
    const currentRoles = user.rol ? user.rol.split(',').map((r: string) => r.trim()) : [];
    const filtered = currentRoles.filter((r: string) => r !== rol);
    return await userRepository.update(usuarioId, { rol: filtered.join(',') });
  }

  async getUsuarioByRol(rol: string): Promise<any[]> {
    const { data } = await userRepository.findAll({ rol, page: 1, limit: 1000 });
    return data;
  }

  async getRolIdByNombre(_nombre: string): Promise<number | null> {
    throw new Error('Los roles son enum, no requieren ID. Usa asignarRol(usuarioId, rol)');
  }
}

export default new UsuarioRolRepository();