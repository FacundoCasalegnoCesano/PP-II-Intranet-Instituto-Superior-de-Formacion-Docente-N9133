import { prisma } from '../config/prisma.js';
import { normalizePagination, paginated, type PaginatedResult, type PaginationInput } from '../utils/pagination.js';

export const cursadaEspacioResumenSelect = {
  id: true,
  espacioCurricularId: true,
  anioLectivo: true,
  periodo: true,
  activo: true,
  espacioCurricular: {
    select: { id: true, nombre: true, carreraId: true, carrera: { select: { id: true, nombre: true } } }
  }
};

export interface PeriodoInscripcionCreateData {
  tipo: string;
  cicloLectivo: number;
  fechaInicio: Date | string;
  fechaFin: Date | string;
  materiasIds?: number[]; // requerido si tipo=MATERIA
  cursadasEspaciosIds?: number[];
  mesasIds?: number[];    // requerido si tipo=EXAMEN
  descripcion?: string | null;
}

export interface PeriodoInscripcionUpdateData {
  tipo?: string;
  cicloLectivo?: number;
  fechaInicio?: Date | string;
  fechaFin?: Date | string;
  materiasIds?: number[];
  cursadasEspaciosIds?: number[];
  mesasIds?: number[];
  descripcion?: string | null;
  activo?: boolean;
}

export interface PeriodoInscripcionListadoRecord {
  id: number;
  tipo: string;
  cicloLectivo: number;
  fechaInicio: Date;
  fechaFin: Date;
  descripcion: string | null;
  activo: boolean;
  cursadasEspacios: Array<{
    id: number;
    cursadaEspacioId: number;
    cursadaEspacio: {
      id: number;
      espacioCurricularId: number;
      anioLectivo: number;
      periodo: string;
      activo: boolean;
      espacioCurricular: { id: number; nombre: string; carreraId: number | null; carrera: { id: number; nombre: string } | null };
    };
  }>;
  _count: {
    materias: number;
    cursadasEspacios: number;
    mesas: number;
  };
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
        ...(data.tipo === 'MATERIA' && data.cursadasEspaciosIds?.length
          ? { cursadasEspacios: { create: data.cursadasEspaciosIds.map(cursadaEspacioId => ({ cursadaEspacioId })) } }
          : {}),
        ...(data.tipo === 'EXAMEN' && data.mesasIds?.length
          ? { mesas: { create: data.mesasIds.map(mesaId => ({ mesaId })) } }
          : {})
      },
      include: {
        materias: true,
        cursadasEspacios: { include: { cursadaEspacio: { select: cursadaEspacioResumenSelect } } },
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

  async cursadaEspacioHabilitadaEnPeriodoVigente(cursadaEspacioId: number): Promise<boolean> {
    const ahora = new Date();
    const count = await prisma.periodoEspacioHabilitado.count({
      where: {
        cursadaEspacioId,
        periodoInscripcion: {
          tipo: 'MATERIA', activo: true,
          fechaInicio: { lte: ahora }, fechaFin: { gte: ahora }
        },
        cursadaEspacio: { activo: true }
      }
    });
    return count > 0;
  }

  async cursadasEspacioHabilitadasEnPeriodoVigente(cursadaEspacioIds: number[]): Promise<Set<number>> {
    if (cursadaEspacioIds.length === 0) return new Set();
    const ahora = new Date();
    const rows = await prisma.periodoEspacioHabilitado.findMany({
      where: {
        cursadaEspacioId: { in: cursadaEspacioIds },
        periodoInscripcion: {
          tipo: 'MATERIA', activo: true,
          fechaInicio: { lte: ahora }, fechaFin: { gte: ahora }
        },
        cursadaEspacio: { activo: true }
      },
      select: { cursadaEspacioId: true }, distinct: ['cursadaEspacioId']
    });
    return new Set(rows.map(row => row.cursadaEspacioId));
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
        cursadasEspacios: { include: { cursadaEspacio: { select: cursadaEspacioResumenSelect } } },
        mesas: { include: { mesa: true } }
      }
    });
  }

  async findAll(filters: { tipo?: string; activo?: boolean; cicloLectivo?: number } & PaginationInput = {}): Promise<PaginatedResult<PeriodoInscripcionListadoRecord>> {
    const where: any = {};
    if (filters.tipo) where.tipo = filters.tipo as any;
    if (filters.activo !== undefined) where.activo = filters.activo;
    if (filters.cicloLectivo !== undefined) where.cicloLectivo = filters.cicloLectivo;

    const { page, limit, skip } = normalizePagination(filters);
    const [data, total] = await Promise.all([prisma.periodoInscripcion.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ fechaInicio: 'desc' }, { id: 'desc' }],
      include: {
        _count: { select: { materias: true, cursadasEspacios: true, mesas: true } },
        cursadasEspacios: { select: { id: true, cursadaEspacioId: true, cursadaEspacio: { select: cursadaEspacioResumenSelect } } }
      }
    }), prisma.periodoInscripcion.count({ where })]);
    return paginated(data as unknown as PeriodoInscripcionListadoRecord[], total, page, limit);
  }

  async findActivosByTipo(tipo: string): Promise<any[]> {
    const ahora = new Date();
    return await prisma.periodoInscripcion.findMany({
      where: {
        tipo: tipo as any,
        activo: true,
        fechaInicio: { lte: ahora },
        fechaFin: { gte: ahora }
      },
      include: { materias: true, cursadasEspacios: { include: { cursadaEspacio: { select: cursadaEspacioResumenSelect } } }, mesas: true }
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
        cursadasEspacios: { include: { cursadaEspacio: { select: cursadaEspacioResumenSelect } } },
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
