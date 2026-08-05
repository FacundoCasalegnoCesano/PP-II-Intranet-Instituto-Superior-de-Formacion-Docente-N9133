import { prisma } from '../config/prisma.js';

// Los roles están definidos como ENUM en el schema (Rol), no como modelo.
// UsuarioRol.rol es el valor del enum directamente (p.ej. 'ADMINISTRATIVO').

class UsuarioRolRepository {
  async asignarRol(usuarioId: number, rol: string): Promise<any> {
    return await prisma.usuarioRol.create({
      data: {
        usuarioId,
        rol: rol as any,
        activo: true
      }
    });
  }

  async removerRol(usuarioId: number, rol: string): Promise<any> {
    return await prisma.usuarioRol.updateMany({
      where: {
        usuarioId,
        rol: rol as any,
        activo: true
      },
      data: {
        activo: false
      }
    });
  }

  async getRolesByUsuario(usuarioId: number): Promise<any[]> {
    return await prisma.usuarioRol.findMany({
      where: {
        usuarioId,
        activo: true
      }
    });
  }

  async getUsuarioByRol(rol: string): Promise<any[]> {
    return await prisma.usuarioRol.findMany({
      where: {
        rol: rol as any,
        activo: true
      },
      include: {
        usuario: {
          select: {
            id: true,
            apellidoNombre: true,
            email: true,
            dni: true
          }
        }
      }
    });
  }

  async getRolesByNombre(usuarioId: number, rol: string): Promise<any> {
    return await prisma.usuarioRol.findFirst({
      where: {
        usuarioId,
        rol: rol as any,
        activo: true
      }
    });
  }

  // Mantenido por compatibilidad. Ya no se usa: el rol es enum, no modelo.
  async getRolIdByNombre(_nombre: string): Promise<number | null> {
    throw new Error('Los roles son enum, no requieren ID. Usa asignarRol(usuarioId, rol)');
  }
}

export default new UsuarioRolRepository();