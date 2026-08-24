import { prisma } from '../config/prisma.js';

export interface LibroDeTemaCreateData {
  materiaId: number;
  fecha: Date;
  temaDesarrollado: string;
  observaciones?: string | null;
}

export interface LibroDeTemaUpdateData {
  fecha?: Date;
  temaDesarrollado?: string;
  observaciones?: string | null;
}

export interface LibroDeTemaListFilters {
  page?: number;
  limit?: number;
  materiaId?: number;
  fechaDesde?: Date;
  fechaHasta?: Date;
}

const MATERIA_SELECT = {
  select: {
    id: true,
    nombre: true
  }
} as const;

class LibroDeTemaRepository {
  async create(data: LibroDeTemaCreateData): Promise<any> {
    return await prisma.libroDeTema.create({
      data: {
        materiaId: data.materiaId,
        fecha: data.fecha,
        temaDesarrollado: data.temaDesarrollado,
        observaciones: data.observaciones ?? null
      },
      include: {
        materia: MATERIA_SELECT
      }
    });
  }

  async findById(id: number): Promise<any> {
    return await prisma.libroDeTema.findUnique({
      where: { idLibroDeTema: id },
      include: {
        materia: MATERIA_SELECT
      }
    });
  }

  async update(id: number, data: LibroDeTemaUpdateData): Promise<any> {
    const cleanData: any = { ...data };
    Object.keys(cleanData).forEach(key => {
      if (cleanData[key] === undefined) delete cleanData[key];
    });

    return await prisma.libroDeTema.update({
      where: { idLibroDeTema: id },
      data: cleanData,
      include: {
        materia: MATERIA_SELECT
      }
    });
  }

  async delete(id: number): Promise<any> {
    return await prisma.libroDeTema.delete({
      where: { idLibroDeTema: id }
    });
  }

  async findByMateriaId(materiaId: number): Promise<any[]> {
    return await prisma.libroDeTema.findMany({
      where: { materiaId },
      include: {
        materia: MATERIA_SELECT
      },
      orderBy: { fecha: 'desc' }
    });
  }

  async findAll(filters: LibroDeTemaListFilters = {}): Promise<{
    data: any[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;

    const where: any = {};
    if (filters.materiaId) where.materiaId = filters.materiaId;
    if (filters.fechaDesde || filters.fechaHasta) {
      where.fecha = {};
      if (filters.fechaDesde) where.fecha.gte = filters.fechaDesde;
      if (filters.fechaHasta) where.fecha.lte = filters.fechaHasta;
    }

    const [registros, total] = await Promise.all([
      prisma.libroDeTema.findMany({
        where,
        include: {
          materia: MATERIA_SELECT
        },
        orderBy: { fecha: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.libroDeTema.count({ where })
    ]);

    return {
      data: registros,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async isProfesorAsignado(profesorId: number, materiaId: number): Promise<boolean> {
    const asignacion = await prisma.profesorMateria.findFirst({
      where: {
        profesorId,
        materiaId,
        activo: true,
        fechaBaja: null
      }
    });
    return asignacion !== null;
  }

  async isDocenteDeCursada(profesorId: number, materiaId: number): Promise<boolean> {
    const cursada = await prisma.cursada.findFirst({
      where: {
        docenteId: profesorId,
        materiaId,
        activo: true
      }
    });
    return cursada !== null;
  }
}

export default new LibroDeTemaRepository();
