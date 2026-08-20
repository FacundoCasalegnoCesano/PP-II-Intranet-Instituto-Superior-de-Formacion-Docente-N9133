import { prisma } from '../config/prisma.js';

export interface InscripcionMateriaCreateData {
  alumnoId: number;
  materiaId: number;
  cicloLectivo: number;
  modalidadElegida: string;
  cursadaId?: number;
}

export interface InscripcionMateriaUpdateData {
  fechaBaja?: Date;
  modalidadElegida?: string;
  estado?: string;
  cursadaId?: number;
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

  async findByAlumnoId(alumnoId: number): Promise<any[]> {
    return await prisma.inscripcionMateria.findMany({
      where: {
        alumnoId,
        estado: { in: ['ACTIVA', 'RECURSANDO'] }
      },
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
    });
  }

  async findByMateriaId(materiaId: number): Promise<any[]> {
    return await prisma.inscripcionMateria.findMany({
      where: {
        materiaId,
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
        }
      }
    });
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