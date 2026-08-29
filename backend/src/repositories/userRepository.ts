import { prisma } from '../config/prisma.js';

export interface UserFilters {
  page?: number;
  limit?: number;
  rol?: string;
  activo?: string | boolean;
  search?: string;
}

export interface AlumnoProfesorFilters {
  page?: number;
  limit?: number;
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
  backupCodes?: string | null;
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
  backupCodes?: string | null;
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
        foto: data.foto ?? null,
        backupCodes: data.backupCodes ?? null
      }
    });
  }

  async findById(id: number) {
    return await prisma.usuario.findUnique({
      where: { idUsuario: id },
      include: {
        alumno: true,
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
    const { rol, activo, search, page = 1, limit = 20 } = filters;
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

  async findAlumnosForProfesor(filters: AlumnoProfesorFilters = {}, profesorId: number) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: any = {
      rol: { contains: 'ALUMNO' },
      alumno: {
        inscripcionesMateria: {
          some: {
            estado: { in: ['ACTIVA', 'RECURSANDO'] },
            fechaBaja: null,
            cursada: {
              OR: [
                { docenteId: profesorId },
                {
                  materia: {
                    profesorMaterias: {
                      some: { profesorId, activo: true, fechaBaja: null }
                    }
                  }
                }
              ]
            }
          }
        }
      }
    };
    if (filters.search) {
      where.OR = [
        { apellidoNombre: { contains: filters.search } },
        { email: { contains: filters.search } }
      ];
      if (/^\d{7,8}$/.test(filters.search)) where.OR.push({ dni: { equals: parseInt(filters.search) } });
    }

    const [usuarios, total] = await Promise.all([
      prisma.usuario.findMany({
        where,
        skip,
        take: limit,
        orderBy: { apellidoNombre: 'asc' },
        select: { idUsuario: true, apellidoNombre: true, dni: true, email: true, activo: true, rol: true, createdAt: true, updatedAt: true }
      }),
      prisma.usuario.count({ where })
    ]);
    return {
      data: usuarios.map((user: any) => ({ ...user, roles: user.rol.split(',').map((rol: string) => rol.trim()) })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
  }

  async alumnoVisibleParaProfesor(usuarioId: number, profesorId: number): Promise<boolean> {
    const alumno = await prisma.usuario.findFirst({
      where: {
        idUsuario: usuarioId,
        rol: { contains: 'ALUMNO' },
        alumno: {
          inscripcionesMateria: {
            some: {
              estado: { in: ['ACTIVA', 'RECURSANDO'] },
              fechaBaja: null,
              cursada: {
                OR: [
                  { docenteId: profesorId },
                  {
                    materia: {
                      profesorMaterias: {
                        some: { profesorId, activo: true, fechaBaja: null }
                      }
                    }
                  }
                ]
              }
            }
          }
        }
      },
      select: { idUsuario: true }
    });
    return alumno !== null;
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

  async updateBackupCodes(id: number, backupCodes: string) {
    return await prisma.usuario.update({
      where: { idUsuario: id },
      data: { backupCodes }
    });
  }

  async updatePasswordAndActivate(id: number, passwordHash: string) {
    return await prisma.usuario.update({
      where: { idUsuario: id },
      data: { passwordHash, activo: true }
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
