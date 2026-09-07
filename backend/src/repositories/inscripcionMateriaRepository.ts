import { prisma } from '../config/prisma.js';
import { normalizePagination, paginated, type PaginationInput } from '../utils/pagination.js';

export interface InscripcionMateriaCreateData {
  alumnoId: number;
  materiaId: number;
  cicloLectivo: number;
  modalidadElegida: string;
  cursadaId?: number;
}

export interface InscripcionMateriaUpdateData {
  fechaInscripcion?: Date;
  fechaBaja?: Date | null;
  modalidadElegida?: string;
  estado?: string;
  cursadaId?: number | null;
}

class InscripcionMateriaRepository {
  async create(data: InscripcionMateriaCreateData): Promise<any> {
    return await prisma.inscripcionMateria.create({
      data: {
        alumnoId: data.alumnoId,
        materiaId: data.materiaId,
        cicloLectivo: data.cicloLectivo,
        modalidadElegida: data.modalidadElegida as any,
        cursadaId: data.cursadaId ?? null,
        fechaInscripcion: new Date(),
        estado: 'ACTIVA'
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
        },
        materia: {
          include: {
            carrera: true,
            correlatividadesOrigen: {
              where: { tipoRequisito: 'OBLIGATORIA' },
              include: {
                materiaRequerida: true
              }
            }
          }
        }
      }
    });
  }

  async findById(id: number): Promise<any> {
    return await prisma.inscripcionMateria.findUnique({
      where: { id },
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
        },
        materia: {
          include: {
            carrera: true,
            correlatividadesOrigen: {
              where: { tipoRequisito: 'OBLIGATORIA' },
              include: {
                materiaRequerida: true
              }
            }
          }
        },
        cursada: true
      }
    });
  }

  async findByAlumnoId(alumnoId: number, pagination: PaginationInput = {}) {
    const { page, limit, skip } = normalizePagination(pagination);
    const where: any = { alumnoId, estado: { in: ['ACTIVA', 'RECURSANDO'] } };
    const [data, total] = await Promise.all([prisma.inscripcionMateria.findMany({
      where: {
        alumnoId,
        estado: { in: ['ACTIVA', 'RECURSANDO'] }
      },
      skip,
      take: limit,
      include: {
        materia: {
          include: {
            carrera: true
          }
        },
        cursada: true
      },
      orderBy: {
        fechaInscripcion: 'desc'
      }
    }), prisma.inscripcionMateria.count({ where })]);
    return paginated(data, total, page, limit);
  }

  async findByMateriaId(materiaId: number, pagination: PaginationInput = {}) {
    const { page, limit, skip } = normalizePagination(pagination);
    const where: any = { materiaId, estado: 'ACTIVA' };
    const [data, total] = await Promise.all([prisma.inscripcionMateria.findMany({
      where: {
        materiaId,
        estado: 'ACTIVA'
      },
      skip,
      take: limit,
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
      orderBy: { id: 'asc' }
    }), prisma.inscripcionMateria.count({ where })]);
    return paginated(data, total, page, limit);
  }

  async findByAlumnoAndMateria(alumnoId: number, materiaId: number, cicloLectivo: number): Promise<any> {
    return await prisma.inscripcionMateria.findFirst({
      where: {
        alumnoId,
        materiaId,
        cicloLectivo,
        estado: { in: ['ACTIVA', 'RECURSANDO'] }
      }
    });
  }

  async findByAlumnoAndMateriaIncludingBaja(alumnoId: number, materiaId: number, cicloLectivo: number): Promise<any> {
    return await prisma.inscripcionMateria.findFirst({
      where: {
        alumnoId,
        materiaId,
        cicloLectivo
      }
    });
  }

  async findHistorialByAlumnoAndMateria(alumnoId: number, materiaId: number): Promise<any[]> {
    return await prisma.inscripcionMateria.findMany({
      where: {
        alumnoId,
        materiaId
      },
      include: {
        cursada: {
          include: {
            calificaciones: true,
            asistencias: true
          }
        }
      },
      orderBy: {
        cicloLectivo: 'desc'
      }
    });
  }

  async update(id: number, data: InscripcionMateriaUpdateData): Promise<any> {
    const cleanData: any = { ...data };
    Object.keys(cleanData).forEach(key => {
      if (cleanData[key] === undefined) delete cleanData[key];
    });

    return await prisma.inscripcionMateria.update({
      where: { id },
      data: cleanData,
      include: {
        materia: true
      }
    });
  }

  async delete(id: number): Promise<any> {
    return await prisma.inscripcionMateria.update({
      where: { id },
      data: { estado: 'BAJA', fechaBaja: new Date() }
    });
  }

  async countByAlumnoAndCiclo(alumnoId: number, cicloLectivo: number): Promise<number> {
    return await prisma.inscripcionMateria.count({
      where: {
        alumnoId,
        cicloLectivo,
        estado: 'ACTIVA'
      }
    });
  }

  async getMateriasAprobadas(alumnoId: number): Promise<any[]> {
    return await prisma.calificacion.findMany({
      where: {
        alumnoId,
        nota: { gte: 6 }
      },
      include: {
        cursada: {
          include: {
            materia: true
          }
        }
      },
      distinct: ['cursadaId']
    });
  }
}

export default new InscripcionMateriaRepository();
