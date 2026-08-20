import { prisma } from '../config/prisma.js';

export interface CarreraFilters {
  page?: number;
  limit?: number;
  search?: string;
  activo?: boolean;
}

export interface CarreraCreateData {
  nombre: string;
  duracionAnios: number;
}

export interface CarreraUpdateData {
  nombre?: string;
  duracionAnios?: number;
  activo?: boolean;
}

// Definir tipo manualmente
export type Carrera = {
  id: number;
  nombre: string;
  duracionAnios: number;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
  materias?: any[];
};

class CarreraRepository {
  async create(data: CarreraCreateData): Promise<any> {
    return await prisma.carrera.create({
      data: {
        nombre: data.nombre,
        duracionAnios: data.duracionAnios
      }
    });
  }

  async findById(id: number): Promise<any> {
    return await prisma.carrera.findUnique({
      where: { id },
      include: {
        materias: {
          where: { activo: true },
          select: {
            id: true,
            nombre: true,
            tipoEspacio: true,
            cargaHoraria: true
          }
        }
      }
    });
  }

  async findAll(filters: CarreraFilters = {}) {
    const { search, activo, page = 1, limit = 10 } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search) {
      where.nombre = { contains: search };
    }
    if (activo !== undefined) {
      where.activo = activo;
    }

    const [carreras, total] = await Promise.all([
      prisma.carrera.findMany({
        where,
        skip,
        take: limit,
        orderBy: { nombre: 'asc' },
        include: {
          materias: {
            select: {
              id: true,
              nombre: true,
              tipoEspacio: true,
              activo: true
            },
            orderBy: { nombre: 'asc' }
          },
          _count: {
            select: { materias: true }
          }
        }
      }),
      prisma.carrera.count({ where })
    ]);

    return {
      data: carreras,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async update(id: number, data: CarreraUpdateData): Promise<any> {
    const cleanData: any = { ...data };
    Object.keys(cleanData).forEach(key => {
      if (cleanData[key] === undefined) delete cleanData[key];
    });

    return await prisma.carrera.update({
      where: { id },
      data: cleanData
    });
  }

  async delete(id: number): Promise<any> {
    return await prisma.carrera.update({
      where: { id },
      data: { activo: false }
    });
  }

  async hardDelete(id: number): Promise<any> {
    return await prisma.carrera.delete({
      where: { id }
    });
  }

  async getPlanEstudio(id: number): Promise<any> {
    return await prisma.carrera.findUnique({
      where: { id },
      include: {
        materias: {
          where: { activo: true },
          orderBy: { nombre: 'asc' },
          include: {
            curso: true
          }
        }
      }
    });
  }

  async findByNombre(nombre: string): Promise<any> {
    return await prisma.carrera.findUnique({
      where: { nombre }
    });
  }
}

export default new CarreraRepository();