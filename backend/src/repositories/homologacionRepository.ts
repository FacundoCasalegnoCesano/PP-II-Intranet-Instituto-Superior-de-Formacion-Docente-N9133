import { prisma } from '../config/prisma.js';
import { normalizePagination, paginated, type PaginationInput } from '../utils/pagination.js';

export interface HomologacionCreateData {
  alumnoId: number;
  materiaId: number;
  tipoHomologacion: string;
  calificacion: number;
  observacion?: string | null;
}

export interface HomologacionUpdateData {
  estado?: string;
  notaExamenHomologacion?: number | null;
  observacion?: string | null;
}

class HomologacionRepository {
  async create(data: HomologacionCreateData): Promise<any> {
    return await prisma.homologacion.create({
      data: {
        alumnoId: data.alumnoId,
        materiaId: data.materiaId,
        tipoHomologacion: data.tipoHomologacion as any,
        calificacion: data.calificacion,
        observacion: data.observacion ?? null,
        estado: 'PENDIENTE'
      },
      include: {
        alumno: {
          include: {
            usuario: {
              select: { idUsuario: true, apellidoNombre: true, email: true, dni: true }
            }
          }
        },
        materia: {
          include: { carrera: true }
        }
      }
    });
  }

  async findById(id: number): Promise<any> {
    return await prisma.homologacion.findUnique({
      where: { id },
      include: {
        alumno: {
          include: {
            usuario: {
              select: { idUsuario: true, apellidoNombre: true, email: true, dni: true }
            }
          }
        },
        materia: {
          include: { carrera: true }
        }
      }
    });
  }

  async findByAlumno(alumnoId: number): Promise<any[]> {
    return await prisma.homologacion.findMany({
      where: { alumnoId },
      include: {
        materia: {
          include: { carrera: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async findAll(filters: { estado?: string; alumnoId?: number } & PaginationInput = {}) {
    const where: any = {};
    if (filters.estado) where.estado = filters.estado as any;
    if (filters.alumnoId) where.alumnoId = filters.alumnoId;

    const { page, limit, skip } = normalizePagination(filters);
    const [data, total] = await Promise.all([prisma.homologacion.findMany({
      where,
      skip,
      take: limit,
      include: {
        alumno: {
          include: {
            usuario: {
              select: { idUsuario: true, apellidoNombre: true, email: true, dni: true }
            }
          }
        },
        materia: {
          include: { carrera: true }
        }
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
    }), prisma.homologacion.count({ where })]);
    return paginated(data, total, page, limit);
  }

  async update(id: number, data: HomologacionUpdateData): Promise<any> {
    const cleanData: any = { ...data };
    Object.keys(cleanData).forEach(key => {
      if (cleanData[key] === undefined) delete cleanData[key];
    });

    if (cleanData.estado) {
      cleanData.estado = cleanData.estado as any;
    }

    return await prisma.homologacion.update({
      where: { id },
      data: cleanData,
      include: {
        alumno: {
          include: {
            usuario: {
              select: { idUsuario: true, apellidoNombre: true, email: true, dni: true }
            }
          }
        },
        materia: {
          include: { carrera: true }
        }
      }
    });
  }
}

export default new HomologacionRepository();
