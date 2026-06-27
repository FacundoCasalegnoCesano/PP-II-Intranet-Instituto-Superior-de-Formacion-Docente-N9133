import { prisma } from '../config/prisma.js';

export interface InscripcionCarreraCreateData {
  alumnoId: number;
  carreraId: number;
  cicloLectivo: number;
}

export interface InscripcionCarreraUpdateData {
  fechaBaja?: Date;
  activo?: boolean;
}

class InscripcionCarreraRepository {
  async create(data: InscripcionCarreraCreateData): Promise<any> {
    return await prisma.inscripcionCarrera.create({
      data: {
        alumnoId: data.alumnoId,
        carreraId: data.carreraId,
        cicloLectivo: data.cicloLectivo,
        fechaInscripcion: new Date(),
        activo: true
      },
      include: {
        alumno: {
          select: {
            id: true,
            apellidoNombre: true,
            email: true,
            dni: true
          }
        },
        carrera: true
      }
    });
  }

  async findById(id: number): Promise<any> {
    return await prisma.inscripcionCarrera.findUnique({
      where: { id },
      include: {
        alumno: {
          select: {
            id: true,
            apellidoNombre: true,
            email: true,
            dni: true
          }
        },
        carrera: true
      }
    });
  }

  async findByAlumnoId(alumnoId: number): Promise<any[]> {
    return await prisma.inscripcionCarrera.findMany({
      where: {
        alumnoId,
        activo: true
      },
      include: {
        carrera: true
      },
      orderBy: {
        fechaInscripcion: 'desc'
      }
    });
  }

  async findByCarreraId(carreraId: number): Promise<any[]> {
    return await prisma.inscripcionCarrera.findMany({
      where: {
        carreraId,
        activo: true
      },
      include: {
        alumno: {
          select: {
            id: true,
            apellidoNombre: true,
            email: true,
            dni: true
          }
        }
      }
    });
  }

  async findByAlumnoAndCarrera(alumnoId: number, carreraId: number): Promise<any> {
    return await prisma.inscripcionCarrera.findFirst({
      where: {
        alumnoId,
        carreraId,
        activo: true
      }
    });
  }

  async update(id: number, data: InscripcionCarreraUpdateData): Promise<any> {
    const cleanData: any = { ...data };
    Object.keys(cleanData).forEach(key => {
      if (cleanData[key] === undefined) delete cleanData[key];
    });

    return await prisma.inscripcionCarrera.update({
      where: { id },
      data: cleanData,
      include: {
        carrera: true
      }
    });
  }

  async delete(id: number): Promise<any> {
    return await prisma.inscripcionCarrera.update({
      where: { id },
      data: { activo: false, fechaBaja: new Date() }
    });
  }

  async countByAlumno(alumnoId: number): Promise<number> {
    return await prisma.inscripcionCarrera.count({
      where: {
        alumnoId,
        activo: true
      }
    });
  }

  async getCarrerasInscriptas(alumnoId: number): Promise<any[]> {
    return await prisma.inscripcionCarrera.findMany({
      where: {
        alumnoId,
        activo: true
      },
      include: {
        carrera: {
          include: {
            materias: {
              where: { activo: true },
              select: {
                id: true,
                nombre: true,
                codigo: true
              }
            }
          }
        }
      },
      orderBy: {
        fechaInscripcion: 'desc'
      }
    });
  }
}

export default new InscripcionCarreraRepository();