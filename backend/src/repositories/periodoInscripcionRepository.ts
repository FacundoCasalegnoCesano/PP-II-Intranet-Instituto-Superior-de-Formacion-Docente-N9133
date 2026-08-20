import { prisma } from '../config/prisma.js';

export interface PeriodoInscripcionCreateData {
  tipo: string;
  fechaInicio: Date | string;
  fechaFin: Date | string;
  descripcion?: string | null;
}

export interface PeriodoInscripcionUpdateData {
  tipo?: string;
  fechaInicio?: Date | string;
  fechaFin?: Date | string;
  descripcion?: string | null;
  activo?: boolean;
}

class PeriodoInscripcionRepository {
  async create(data: PeriodoInscripcionCreateData): Promise<any> {
    return await prisma.periodoInscripcion.create({
      data: {
        tipo: data.tipo as any,
        fechaInicio: new Date(data.fechaInicio),
        fechaFin: new Date(data.fechaFin),
        descripcion: data.descripcion ?? null,
        activo: true
      }
    });
  }

  async findById(id: number): Promise<any> {
    return await prisma.periodoInscripcion.findUnique({
      where: { id }
    });
  }

  async findAll(filters: { tipo?: string; activo?: boolean } = {}): Promise<any[]> {
    const where: any = {};
    if (filters.tipo) where.tipo = filters.tipo as any;
    if (filters.activo !== undefined) where.activo = filters.activo;

    return await prisma.periodoInscripcion.findMany({
      where,
      orderBy: { fechaInicio: 'desc' }
    });
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
      data: cleanData
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