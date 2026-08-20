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
  rol: string;
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
  rol?: string;
  contactoEmergencia?: string | null;
  foto?: string | null;
  activo?: boolean;
}

// Tipo para el resultado de usuario (sin tipos de Prisma)
export type UsuarioResult = {
  idUsuario: number;
  apellidoNombre: string;
  dni: number;
  email: string;
  fechaNacimiento: Date;
  telefono: string;
  passwordHash: string;
  cuil: string | null;
  activo: boolean;
  rol: string;
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
        dni: parseInt(data.dni),
        email: data.email,
        fechaNacimiento: new Date(data.fechaNacimiento),
        telefono: data.telefono,
        passwordHash: data.passwordHash,
        cuil: data.cuil ?? null,
        rol: data.rol,
        contactoEmergencia: data.contactoEmergencia ?? null,
        foto: data.foto ?? null
      }
    });
  }

  async findById(id: number) {
    return await prisma.usuario.findUnique({
      where: { idUsuario: id },
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
        }
      }
    });
  }

  async findByEmail(email: string) {
    return await prisma.usuario.findUnique({
      where: { email }
    });
  }

  async findByDni(dni: string) {
    return await prisma.usuario.findUnique({
      where: { dni: parseInt(dni) }
    });
  }

  async findByEmailOrDni(identifier: string) {
    const parsedDni = /^\d{7,8}$/.test(identifier) ? parseInt(identifier) : null;
    
    return await prisma.usuario.findFirst({
      where: {
        OR: [
          { email: identifier },
          ...(parsedDni ? [{ dni: parsedDni }] : [])
        ]
      }
    });
  }

  async findAll(filters: UserFilters = {}) {
    const { rol, activo, search, page = 1, limit = 10 } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    
    if (rol) {
      where.OR = rol.includes(',')
        ? rol.split(',').map((r: string) => ({ rol: { contains: r } }))
        : [{ rol: { contains: rol } }];
    }
    
    if (activo !== undefined && activo !== '') {
      where.activo = activo === 'true' || activo === true;
    }
    
    if (search && search !== '') {
      where.OR = where.OR || [];
      where.OR.push(
        { apellidoNombre: { contains: search } },
        { email: { contains: search } },
        { dni: { equals: /^\d{7,8}$/.test(search) ? parseInt(search) : undefined } }
      );
      // Filter out undefined values
      where.OR = where.OR.filter((c: any) => c.dni === undefined ? false : true).filter((c: any) => {
        if (c.dni && c.dni.equals === undefined) return false;
        return true;
      });
    }

    const [usuarios, total] = await Promise.all([
      prisma.usuario.findMany({
        where,
        skip,
        take: parseInt(limit.toString()),
        orderBy: { createdAt: 'desc' },
        select: {
          idUsuario: true,
          apellidoNombre: true,
          dni: true,
          email: true,
          activo: true,
          rol: true,
          createdAt: true,
          updatedAt: true
        }
      }),
      prisma.usuario.count({ where })
    ]);

    const usuariosFormateados = usuarios.map((user: any) => {
      const roles = user.rol ? user.rol.split(',').map((r: string) => r.trim()) : [];
      return {
        ...user,
        roles
      };
    });

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
    
    if (cleanData.dni) {
      cleanData.dni = parseInt(cleanData.dni);
    }
    if (cleanData.fechaNacimiento) {
      cleanData.fechaNacimiento = new Date(cleanData.fechaNacimiento);
    }

    return await prisma.usuario.update({
      where: { idUsuario: id },
      data: cleanData
    });
  }

  async updatePassword(id: number, passwordHash: string) {
    return await prisma.usuario.update({
      where: { idUsuario: id },
      data: { passwordHash }
    });
  }

  async updateLastAccess(id: number) {
    return await prisma.usuario.update({
      where: { idUsuario: id },
      data: { ultimoAcceso: new Date() }
    });
  }

  async toggleActive(id: number, activo: boolean = false) {
    return await prisma.usuario.update({
      where: { idUsuario: id },
      data: { activo }
    });
  }

  async delete(id: number) {
    return await prisma.usuario.delete({
      where: { idUsuario: id }
    });
  }

  async findByIds(ids: number[]) {
    return await prisma.usuario.findMany({
      where: {
        idUsuario: { in: ids }
      }
    });
  }

  async findWithRoles(id: number) {
    return await prisma.usuario.findUnique({
      where: { idUsuario: id }
    });
  }

  async findOrCreateAlumno(usuarioId: number, alumnoData: { domicilio: string; anioEgreso: number; institucionProcedencia?: string | null }) {
    const alumno = await prisma.alumno.findUnique({
      where: { idCuenta: usuarioId }
    });

    if (alumno) {
      return alumno;
    }

    return await prisma.alumno.create({
      data: {
        idCuenta: usuarioId,
        domicilio: alumnoData.domicilio,
        anioEgreso: alumnoData.anioEgreso,
        institucionProcedencia: alumnoData.institucionProcedencia ?? null
      }
    });
  }
}

export default new UserRepository();