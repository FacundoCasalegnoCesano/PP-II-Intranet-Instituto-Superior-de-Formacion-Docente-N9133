import { prisma } from '../config/prisma.js';

export interface UserFilters {
  page?: number;
  limit?: number;
  rol?: string;
  activo?: string | boolean;
  search?: string;
}

export interface UserCreateData {
  apellidoNombre: string;
  dni: string;
  email: string;
  fechaNacimiento: Date | string;
  telefono: string;
  passwordHash: string;
  cuil: string;
  contactoEmergencia?: string | null;
  foto?: string | null;
}

export interface UserUpdateData {
  apellidoNombre?: string;
  dni?: string;
  email?: string;
  fechaNacimiento?: Date | string;
  telefono?: string;
  passwordHash?: string;
  cuil?: string;
  contactoEmergencia?: string | null;
  foto?: string | null;
  activo?: boolean;
}

// Tipo para el resultado de usuario (sin tipos de Prisma)
export type UsuarioResult = {
  id: number;
  apellidoNombre: string;
  dni: string;
  email: string;
  fechaNacimiento: Date;
  telefono: string;
  passwordHash: string;
  cuil: string;
  activo: boolean;
  contactoEmergencia: string | null;
  foto: string | null;
  ultimoAcceso: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

class UserRepository {
  async create(data: UserCreateData) {
    return await prisma.usuario.create({
      data: {
        apellidoNombre: data.apellidoNombre,
        dni: data.dni,
        email: data.email,
        fechaNacimiento: new Date(data.fechaNacimiento),
        telefono: data.telefono,
        passwordHash: data.passwordHash,
        cuil: data.cuil,
        contactoEmergencia: data.contactoEmergencia,
        foto: data.foto
      }
    });
  }

  async findById(id: number) {
    return await prisma.usuario.findUnique({
      where: { id },
      include: {
        sesiones: {
          where: {
            cerradaEn: null
          },
          select: {
            id: true,
            creadaEn: true,
            expiraEn: true,
            ipAddress: true
          }
        },
        roles: {
          where: { activo: true },
          include: {
            rol: true
          }
        }
      }
    });
  }

  async findByEmail(email: string) {
    return await prisma.usuario.findUnique({
      where: { email },
      include: {
        roles: {
          where: { activo: true },
          include: {
            rol: true
          }
        }
      }
    });
  }

  async findByDni(dni: string) {
    return await prisma.usuario.findUnique({
      where: { dni },
      include: {
        roles: {
          where: { activo: true },
          include: {
            rol: true
          }
        }
      }
    });
  }

  async findByEmailOrDni(identifier: string) {
    return await prisma.usuario.findFirst({
      where: {
        OR: [
          { email: identifier },
          { dni: identifier }
        ]
      },
      include: {
        roles: {
          where: { activo: true },
          include: {
            rol: true
          }
        }
      }
    });
  }

  async findAll(filters: UserFilters = {}) {
    const { rol, activo, search, page = 1, limit = 10 } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    
    if (rol) {
      where.roles = {
        some: {
          rol: {
            nombre: rol
          },
          activo: true
        }
      };
    }
    
    if (activo !== undefined && activo !== '') {
      where.activo = activo === 'true' || activo === true;
    }
    
    if (search && search !== '') {
      where.OR = [
        { apellidoNombre: { contains: search } },
        { email: { contains: search } },
        { dni: { contains: search } }
      ];
    }

    const [usuarios, total] = await Promise.all([
      prisma.usuario.findMany({
        where,
        skip,
        take: parseInt(limit.toString()),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          apellidoNombre: true,
          dni: true,
          email: true,
          activo: true,
          createdAt: true,
          updatedAt: true,
          roles: {
            where: { activo: true },
            select: {
              rol: {
                select: {
                  nombre: true
                }
              }
            }
          }
        }
      }),
      prisma.usuario.count({ where })
    ]);

    // ✅ Tipar correctamente el parámetro 'user'
    const usuariosFormateados = usuarios.map((user: {
      id: number;
      apellidoNombre: string;
      dni: string;
      email: string;
      activo: boolean;
      createdAt: Date;
      updatedAt: Date;
      roles: Array<{
        rol: {
          nombre: string;
        };
      }>;
    }) => ({
      ...user,
      roles: user.roles.map((r) => r.rol.nombre)
    }));

    return {
      data: usuariosFormateados,
      pagination: {
        page: parseInt(page.toString()),
        limit: parseInt(limit.toString()),
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async update(id: number, data: UserUpdateData) {
    const cleanData: any = { ...data };
    Object.keys(cleanData).forEach(key => {
      if (cleanData[key] === undefined) {
        delete cleanData[key];
      }
    });

    if (cleanData.fechaNacimiento) {
      cleanData.fechaNacimiento = new Date(cleanData.fechaNacimiento);
    }

    return await prisma.usuario.update({
      where: { id },
      data: cleanData
    });
  }

  async updatePassword(id: number, passwordHash: string) {
    return await prisma.usuario.update({
      where: { id },
      data: { passwordHash }
    });
  }

  async updateLastAccess(id: number) {
    return await prisma.usuario.update({
      where: { id },
      data: { ultimoAcceso: new Date() }
    });
  }

  async toggleActive(id: number, activo: boolean = false) {
    return await prisma.usuario.update({
      where: { id },
      data: { activo }
    });
  }

  async delete(id: number) {
    return await prisma.usuario.delete({
      where: { id }
    });
  }

  async findByIds(ids: number[]) {
    return await prisma.usuario.findMany({
      where: {
        id: { in: ids }
      },
      include: {
        roles: {
          where: { activo: true },
          include: {
            rol: true
          }
        }
      }
    });
  }

  async findWithRoles(id: number) {
    return await prisma.usuario.findUnique({
      where: { id },
      include: {
        roles: {
          where: { activo: true },
          include: {
            rol: true
          }
        }
      }
    });
  }
}

export default new UserRepository();