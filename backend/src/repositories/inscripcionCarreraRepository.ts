import { prisma } from '../config/prisma.js';
import { normalizePagination, paginated, type PaginationInput } from '../utils/pagination.js';

export interface InscripcionCarreraCreateData {
  usuarioId: number;
  carreraId: number;
  cicloLectivo: number;
}

export interface InscripcionCarreraUpdateData {
  fechaBaja?: Date;
  activo?: boolean;
}

class InscripcionCarreraRepository {
  async create(data: InscripcionCarreraCreateData): Promise<any> {
    return await prisma.inscripcionCarrera.create({
      data: {
        usuarioId: data.usuarioId,
        carreraId: data.carreraId,
        cicloLectivo: data.cicloLectivo,
        fechaInscripcion: new Date(),
        activo: true
      },
      include: {
        usuario: {
          select: {
            idUsuario: true,
            apellidoNombre: true,
            email: true,
            dni: true
          }
        },
        carrera: true
      }
    });
  }

  async findById(id: number): Promise<any> {
    return await prisma.inscripcionCarrera.findUnique({
      where: { id },
      include: {
        usuario: {
          select: {
            idUsuario: true,
            apellidoNombre: true,
            email: true,
            dni: true
          }
        },
        carrera: true
      }
    });
  }

  async findByUsuarioId(usuarioId: number): Promise<any[]> {
    return await prisma.inscripcionCarrera.findMany({
      where: {
        usuarioId,
        activo: true
      },
      include: {
        carrera: true
      },
      orderBy: {
        fechaInscripcion: 'desc'
      }
    });
  }

  async findByCarreraId(carreraId: number, pagination: PaginationInput = {}) {
    const { page, limit, skip } = normalizePagination(pagination);
    const where = { carreraId, activo: true };
    const [data, total] = await Promise.all([prisma.inscripcionCarrera.findMany({
      where: {
        carreraId,
        activo: true
      },
      skip,
      take: limit,
      include: {
        usuario: {
          select: {
            idUsuario: true,
            apellidoNombre: true,
            email: true,
            dni: true
          }
        }
      },
      orderBy: [{ fechaInscripcion: 'desc' }, { id: 'desc' }]
    }), prisma.inscripcionCarrera.count({ where })]);
    return paginated(data, total, page, limit);
  }

  async findByUsuarioAndCarrera(usuarioId: number, carreraId: number): Promise<any> {
    return await prisma.inscripcionCarrera.findFirst({
      where: {
        usuarioId,
        carreraId,
        activo: true
      }
    });
  }

  async update(id: number, data: InscripcionCarreraUpdateData): Promise<any> {
    const cleanData: any = { ...data };
    Object.keys(cleanData).forEach(key => {
      if (cleanData[key] === undefined) delete cleanData[key];
    });

    return await prisma.inscripcionCarrera.update({
      where: { id },
      data: cleanData,
      include: {
        carrera: true
      }
    });
  }

  async delete(id: number): Promise<any> {
    return await prisma.inscripcionCarrera.update({
      where: { id },
      data: { activo: false, fechaBaja: new Date() }
    });
  }

  async countByUsuario(usuarioId: number): Promise<number> {
    return await prisma.inscripcionCarrera.count({
      where: {
        usuarioId,
        activo: true
      }
    });
  }

  async getCarrerasInscriptas(usuarioId: number): Promise<any[]> {
    return await prisma.inscripcionCarrera.findMany({
      where: {
        usuarioId,
        activo: true
      },
      include: {
        carrera: {
          include: {
            materias: {
              where: { activo: true },
              select: {
                id: true,
                nombre: true
              }
            }
          }
        }
      },
      orderBy: {
        fechaInscripcion: 'desc'
      }
    });
  }
}

export default new InscripcionCarreraRepository();
