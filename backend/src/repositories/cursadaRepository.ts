import { prisma } from '../config/prisma.js';

export interface CursadaCreateData {
  materiaId: number;
  anioLectivo: number;
  periodo: string;
  docenteId?: number | null;
}

export interface CursadaUpdateData {
  anioLectivo?: number;
  periodo?: string;
  docenteId?: number | null;
  activo?: boolean;
}

class CursadaRepository {
  async create(data: CursadaCreateData): Promise<any> {
    return await prisma.cursada.create({
      data: {
        materiaId: data.materiaId,
        anioLectivo: data.anioLectivo,
        periodo: data.periodo as any,
        docenteId: data.docenteId ?? null,
        activo: true
      },
      include: {
        materia: {
          include: {
            carrera: true
          }
        },
        docente: {
          select: {
            idUsuario: true,
            apellidoNombre: true,
            email: true
          }
        }
      }
    });
  }

  async findById(id: number): Promise<any> {
    return await prisma.cursada.findUnique({
      where: { id },
      include: {
        materia: {
          include: {
            carrera: true
          }
        },
        docente: {
          select: {
            idUsuario: true,
            apellidoNombre: true,
            email: true
          }
        },
        horarios: {
          where: { activo: true },
          orderBy: [
            { dia: 'asc' },
            { horaInicio: 'asc' }
          ]
        },
        inscripciones: {
          where: { estado: 'ACTIVA' }
        },
        asistencias: true,
        calificaciones: true
      }
    });
  }

  async findByMateriaId(materiaId: number, anioLectivo?: number): Promise<any[]> {
    const where: any = {
      materiaId,
      activo: true
    };
    if (anioLectivo) {
      where.anioLectivo = anioLectivo;
    }

    return await prisma.cursada.findMany({
      where,
      include: {
        materia: {
          include: {
            carrera: true
          }
        },
        docente: {
          select: {
            idUsuario: true,
            apellidoNombre: true,
            email: true
          }
        },
        horarios: {
          where: { activo: true },
          orderBy: [
            { dia: 'asc' },
            { horaInicio: 'asc' }
          ]
        }
      },
      orderBy: { anioLectivo: 'desc' }
    });
  }

  async findByDocenteId(docenteId: number, anioLectivo?: number): Promise<any[]> {
    const where: any = {
      docenteId,
      activo: true
    };
    if (anioLectivo) {
      where.anioLectivo = anioLectivo;
    }

    return await prisma.cursada.findMany({
      where,
      include: {
        materia: {
          include: {
            carrera: true
          }
        },
        horarios: {
          where: { activo: true },
          orderBy: [
            { dia: 'asc' },
            { horaInicio: 'asc' }
          ]
        }
      },
      orderBy: { anioLectivo: 'desc' }
    });
  }

  async findAll(filters: { anioLectivo?: number; materiaId?: number; docenteId?: number; activo?: boolean } = {}): Promise<any[]> {
    const where: any = {};
    if (filters.anioLectivo) where.anioLectivo = filters.anioLectivo;
    if (filters.materiaId) where.materiaId = filters.materiaId;
    if (filters.docenteId) where.docenteId = filters.docenteId;
    if (filters.activo !== undefined) where.activo = filters.activo;

    return await prisma.cursada.findMany({
      where,
      include: {
        materia: {
          include: {
            carrera: true
          }
        },
        docente: {
          select: {
            idUsuario: true,
            apellidoNombre: true,
            email: true
          }
        },
        horarios: {
          where: { activo: true },
          orderBy: [
            { dia: 'asc' },
            { horaInicio: 'asc' }
          ]
        },
        _count: {
          select: {
            inscripciones: true,
            asistencias: true,
            calificaciones: true
          }
        }
      },
      orderBy: [
        { anioLectivo: 'desc' },
        { materia: { nombre: 'asc' } }
      ]
    });
  }

  async update(id: number, data: CursadaUpdateData): Promise<any> {
    const cleanData: any = { ...data };
    Object.keys(cleanData).forEach(key => {
      if (cleanData[key] === undefined) delete cleanData[key];
    });

    return await prisma.cursada.update({
      where: { id },
      data: cleanData,
      include: {
        materia: {
          include: {
            carrera: true
          }
        },
        docente: {
          select: {
            idUsuario: true,
            apellidoNombre: true,
            email: true
          }
        }
      }
    });
  }

  async delete(id: number): Promise<any> {
    return await prisma.cursada.update({
      where: { id },
      data: { activo: false }
    });
  }

  async hardDelete(id: number): Promise<any> {
    return await prisma.cursada.delete({
      where: { id }
    });
  }

  async getCursadaActivaByMateria(materiaId: number, anioLectivo: number): Promise<any> {
    return await prisma.cursada.findFirst({
      where: {
        materiaId,
        anioLectivo,
        activo: true
      },
      include: {
        horarios: {
          where: { activo: true },
          orderBy: [
            { dia: 'asc' },
            { horaInicio: 'asc' }
          ]
        }
      }
    });
  }

  async findByMateriaAnioPeriodo(
    materiaId: number,
    anioLectivo: number,
    periodo: string
  ): Promise<any> {
    return await prisma.cursada.findFirst({
      where: {
        materiaId,
        anioLectivo,
        periodo: periodo as any
      }
    });
  }

  async findInscriptosByCursadaId(cursadaId: number): Promise<any[]> {
    return await prisma.inscripcionMateria.findMany({
      where: {
        cursadaId,
        estado: 'ACTIVA',
        fechaBaja: null
      },
      include: {
        alumno: {
          include: {
            usuario: {
              select: {
                idUsuario: true,
                apellidoNombre: true,
                email: true,
                dni: true
              }
            }
          }
        }
      },
      orderBy: { fechaInscripcion: 'asc' }
    });
  }
}

export default new CursadaRepository();