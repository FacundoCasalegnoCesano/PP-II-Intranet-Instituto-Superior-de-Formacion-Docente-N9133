import { prisma } from '../config/prisma.js';

class UsuarioRolRepository {
  async asignarRol(usuarioId: number, rolId: number): Promise<any> {
    return await prisma.usuarioRol.create({
      data: {
        usuarioId,
        rolId,
        activo: true
      },
      include: {
        rol: true
      }
    });
  }

  async removerRol(usuarioId: number, rolId: number): Promise<any> {
    return await prisma.usuarioRol.updateMany({
      where: {
        usuarioId,
        rolId,
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
      },
      include: {
        rol: true
      }
    });
  }

  async getUsuarioByRol(rolId: number): Promise<any[]> {
    return await prisma.usuarioRol.findMany({
      where: {
        rolId,
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

  async getRolesByNombre(usuarioId: number, nombreRol: string): Promise<any> {
    return await prisma.usuarioRol.findFirst({
      where: {
        usuarioId,
        rol: {
          nombre: nombreRol
        },
        activo: true
      },
      include: {
        rol: true
      }
    });
  }

  async getRolIdByNombre(nombre: string): Promise<number | null> {
    const rol = await prisma.rol.findUnique({
      where: { nombre }
    });
    return rol?.id || null;
  }
}

export default new UsuarioRolRepository();