import { prisma } from '../config/prisma.js';

export interface HorarioCreateData {
  cursadaId: number;
  dia: string;
  horaInicio: string;
  horaFin: string;
  aula?: string;
}

export interface HorarioUpdateData {
  dia?: string;
  horaInicio?: string;
  horaFin?: string;
  aula?: string;
  activo?: boolean;
}

class HorarioRepository {
  async create(data: HorarioCreateData): Promise<any> {
    return await prisma.horario.create({
      data: {
        cursadaId: data.cursadaId,
        dia: data.dia as any,
        horaInicio: new Date(data.horaInicio),
        horaFin: new Date(data.horaFin),
        aula: data.aula,
        activo: true
      },
      include: {
        cursada: {
          include: {
            materia: true
          }
        }
      }
    });
  }

  async findById(id: number): Promise<any> {
    return await prisma.horario.findUnique({
      where: { id },
      include: {
        cursada: {
          include: {
            materia: true
          }
        }
      }
    });
  }

  async findByCursadaId(cursadaId: number): Promise<any[]> {
    return await prisma.horario.findMany({
      where: {
        cursadaId,
        activo: true
      },
      orderBy: [
        { dia: 'asc' },
        { horaInicio: 'asc' }
      ]
    });
  }

  async findByMateriaId(materiaId: number): Promise<any[]> {
    return await prisma.horario.findMany({
      where: {
        cursada: {
          materiaId
        },
        activo: true
      },
      include: {
        cursada: {
          include: {
            materia: true
          }
        }
      },
      orderBy: [
        { dia: 'asc' },
        { horaInicio: 'asc' }
      ]
    });
  }

  async update(id: number, data: HorarioUpdateData): Promise<any> {
    const cleanData: any = { ...data };
    Object.keys(cleanData).forEach(key => {
      if (cleanData[key] === undefined) delete cleanData[key];
    });

    if (cleanData.horaInicio) {
      cleanData.horaInicio = new Date(cleanData.horaInicio);
    }
    if (cleanData.horaFin) {
      cleanData.horaFin = new Date(cleanData.horaFin);
    }

    return await prisma.horario.update({
      where: { id },
      data: cleanData,
      include: {
        cursada: {
          include: {
            materia: true
          }
        }
      }
    });
  }

  async delete(id: number): Promise<any> {
    return await prisma.horario.update({
      where: { id },
      data: { activo: false }
    });
  }

  async hardDelete(id: number): Promise<any> {
    return await prisma.horario.delete({
      where: { id }
    });
  }

  async verificarConflictos(cursadaId: number, dia: string, horaInicio: Date, horaFin: Date): Promise<boolean> {
    const conflictos = await prisma.horario.findFirst({
      where: {
        cursadaId,
        dia: dia as any,
        activo: true,
        OR: [
          {
            horaInicio: { lte: horaInicio },
            horaFin: { gte: horaInicio }
          },
          {
            horaInicio: { lte: horaFin },
            horaFin: { gte: horaFin }
          },
          {
            horaInicio: { gte: horaInicio },
            horaFin: { lte: horaFin }
          }
        ]
      }
    });

    return !!conflictos;
  }
}

export default new HorarioRepository();