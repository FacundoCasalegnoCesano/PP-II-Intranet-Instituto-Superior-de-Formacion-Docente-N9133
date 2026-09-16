import { prisma } from '../config/prisma.js';
import { normalizePagination, paginated, type PaginationInput } from '../utils/pagination.js';

export interface HomologacionCreateData {
  alumnoId: number;
  materiaId: number;
  tipoHomologacion: string;
  calificacion?: number | null;
  observacion?: string | null;
}

export interface HomologacionUpdateData {
  estado?: string;
  calificacion?: number | null;
  notaExamenHomologacion?: number | null;
  observacion?: string | null;
}

export interface HomologacionFilters extends PaginationInput {
  estado?: string;
  tipo?: string;
  carreraId?: number;
  materiaId?: number;
  search?: string;
}

const homologacionInclude = {
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
};

class HomologacionRepository {
  async create(data: HomologacionCreateData): Promise<any> {
    return await prisma.homologacion.create({
      data: {
        alumnoId: data.alumnoId,
        materiaId: data.materiaId,
        tipoHomologacion: data.tipoHomologacion as any,
        calificacion: data.calificacion ?? null,
        observacion: data.observacion ?? null,
        estado: 'PENDIENTE'
      },
      include: homologacionInclude
    });
  }

  async findById(id: number): Promise<any> {
    return await prisma.homologacion.findUnique({
      where: { id },
      include: homologacionInclude
    });
  }

  async findByAlumno(alumnoId: number): Promise<any[]> {
    return await prisma.homologacion.findMany({
      where: { alumnoId },
      include: homologacionInclude,
      orderBy: { createdAt: 'desc' }
    });
  }

  async findAll(filters: HomologacionFilters = {}) {
    const where: any = {};
    if (filters.estado) where.estado = filters.estado as any;
    if (filters.tipo) where.tipoHomologacion = filters.tipo as any;
    if (filters.materiaId !== undefined) where.materiaId = filters.materiaId;
    if (filters.carreraId !== undefined) where.materia = { carreraId: filters.carreraId };
    if (filters.search) {
      const search = filters.search;
      const conditions: any[] = [
        { alumno: { usuario: { apellidoNombre: { contains: search } } } },
        { alumno: { usuario: { email: { contains: search } } } }
      ];
      if (/^\d+$/.test(search)) {
        conditions.push({ alumno: { usuario: { dni: Number(search) } } });
      }
      where.OR = conditions;
    }

    const { page, limit, skip } = normalizePagination(filters);
    const [data, total] = await Promise.all([prisma.homologacion.findMany({
      where,
      skip,
      take: limit,
      include: homologacionInclude,
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
      include: homologacionInclude
    });
  }
}

export default new HomologacionRepository();
