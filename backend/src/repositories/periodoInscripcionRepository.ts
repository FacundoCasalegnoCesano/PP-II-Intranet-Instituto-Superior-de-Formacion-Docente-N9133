import { prisma } from '../config/prisma.js';
import { normalizePagination, paginated, type PaginationInput } from '../utils/pagination.js';

export interface PeriodoInscripcionCreateData {
  tipo: string;
  cicloLectivo: number;
  fechaInicio: Date | string;
  fechaFin: Date | string;
  materiasIds?: number[]; // requerido si tipo=MATERIA
  mesasIds?: number[];    // requerido si tipo=EXAMEN
  descripcion?: string | null;
}

export interface PeriodoInscripcionUpdateData {
  tipo?: string;
  cicloLectivo?: number;
  fechaInicio?: Date | string;
  fechaFin?: Date | string;
  materiasIds?: number[];
  mesasIds?: number[];
  descripcion?: string | null;
  activo?: boolean;
}

class PeriodoInscripcionRepository {
  async create(data: PeriodoInscripcionCreateData): Promise<any> {
    return await prisma.periodoInscripcion.create({
      data: {
        tipo: data.tipo as any,
        cicloLectivo: data.cicloLectivo,
        fechaInicio: new Date(data.fechaInicio),
        fechaFin: new Date(data.fechaFin),
        descripcion: data.descripcion ?? null,
        activo: true,
        ...(data.tipo === 'MATERIA' && data.materiasIds?.length
          ? { materias: { create: data.materiasIds.map(materiaId => ({ materiaId })) } }
          : {}),
        ...(data.tipo === 'EXAMEN' && data.mesasIds?.length
          ? { mesas: { create: data.mesasIds.map(mesaId => ({ mesaId })) } }
          : {})
      },
      include: {
        materias: true,
        mesas: true
      }
    });
  }

  /**
   * ¿Existe un período MATERIA vigente que incluya explícitamente esta materia?
   */
  async materiaHabilitadaEnPeriodoVigente(materiaId: number): Promise<boolean> {
    const ahora = new Date();
    const count = await prisma.periodoMateriaHabilitada.count({
      where: {
        materiaId,
        periodoInscripcion: {
          tipo: 'MATERIA',
          activo: true,
          fechaInicio: { lte: ahora },
          fechaFin: { gte: ahora }
        }
      }
    });
    return count > 0;
  }

  async materiasHabilitadasEnPeriodoVigente(materiaIds: number[]): Promise<Set<number>> {
    if (materiaIds.length === 0) return new Set();
    const ahora = new Date();
    const filas = await prisma.periodoMateriaHabilitada.findMany({
      where: {
        materiaId: { in: materiaIds },
        periodoInscripcion: {
          tipo: 'MATERIA', activo: true,
          fechaInicio: { lte: ahora }, fechaFin: { gte: ahora }
        }
      },
      select: { materiaId: true },
      distinct: ['materiaId']
    });
    return new Set(filas.map(fila => fila.materiaId));
  }

  /**
   * ¿Existe un período EXAMEN vigente que incluya explícitamente esta mesa?
   */
  async mesaHabilitadaEnPeriodoVigente(mesaId: number): Promise<boolean> {
    const ahora = new Date();
    const count = await prisma.periodoMesaHabilitada.count({
      where: {
        mesaId,
        periodoInscripcion: {
          tipo: 'EXAMEN',
          activo: true,
          fechaInicio: { lte: ahora },
          fechaFin: { gte: ahora }
        }
      }
    });
    return count > 0;
  }

  async findById(id: number): Promise<any> {
    return await prisma.periodoInscripcion.findUnique({
      where: { id },
      include: {
        materias: { include: { materia: true } },
        mesas: { include: { mesa: true } }
      }
    });
  }

  async findAll(filters: { tipo?: string; activo?: boolean; cicloLectivo?: number } & PaginationInput = {}) {
    const where: any = {};
    if (filters.tipo) where.tipo = filters.tipo as any;
    if (filters.activo !== undefined) where.activo = filters.activo;
    if (filters.cicloLectivo !== undefined) where.cicloLectivo = filters.cicloLectivo;

    const { page, limit, skip } = normalizePagination(filters);
    const [data, total] = await Promise.all([prisma.periodoInscripcion.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ fechaInicio: 'desc' }, { id: 'desc' }]
    }), prisma.periodoInscripcion.count({ where })]);
    return paginated(data, total, page, limit);
  }

  async findActivosByTipo(tipo: string): Promise<any[]> {
    const ahora = new Date();
    return await prisma.periodoInscripcion.findMany({
      where: {
        tipo: tipo as any,
        activo: true,
        fechaInicio: { lte: ahora },
        fechaFin: { gte: ahora }
      }
    });
  }

  async update(id: number, data: PeriodoInscripcionUpdateData): Promise<any> {
    const cleanData: any = { ...data };
    Object.keys(cleanData).forEach(key => {
      if (cleanData[key] === undefined) delete cleanData[key];
    });

    if (cleanData.fechaInicio) {
      cleanData.fechaInicio = new Date(cleanData.fechaInicio);
    }
    if (cleanData.fechaFin) {
      cleanData.fechaFin = new Date(cleanData.fechaFin);
    }

    return await prisma.periodoInscripcion.update({
      where: { id },
      data: cleanData,
      include: {
        materias: true,
        mesas: true
      }
    });
  }

  async delete(id: number): Promise<any> {
    return await prisma.periodoInscripcion.update({
      where: { id },
      data: { activo: false }
    });
  }

  async isInscripcionHabilitada(tipo: string): Promise<boolean> {
    const periodos = await this.findActivosByTipo(tipo);
    return periodos.length > 0;
  }
}

export default new PeriodoInscripcionRepository();
