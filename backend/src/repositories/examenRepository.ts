import { prisma } from '../config/prisma.js';

export interface ExamenCreateData {
  materiaId: number;
  fecha: Date;
  tipoExamen: string;
  llamado: number;
  folio?: string;
  libro?: string;
}

export interface ExamenUpdateData {
  fecha?: Date;
  tipoExamen?: string;
  llamado?: number;
  folio?: string;
  libro?: string;
  activo?: boolean;
}

export interface TribunalCreateData {
  examenId: number;
  profesorId: number;
  rolTribunal: string;
}

class ExamenRepository {
  // ===== EXÁMENES =====
  async createExamen(data: ExamenCreateData): Promise<any> {
    return await prisma.examen.create({
      data: {
        materiaId: data.materiaId,
        fecha: data.fecha,
        tipoExamen: data.tipoExamen as any,
        llamado: data.llamado,
        folio: data.folio,
        libro: data.libro,
        activo: true
      },
      include: {
        materia: {
          include: {
            carrera: true
          }
        }
      }
    });
  }

  async findExamenById(id: number): Promise<any> {
    return await prisma.examen.findUnique({
      where: { id },
      include: {
        materia: {
          include: {
            carrera: true
          }
        },
        tribunales: {
          include: {
            profesor: {
              select: {
                id: true,
                apellidoNombre: true,
                email: true
              }
            }
          }
        },
        inscripciones: {
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
        }
      }
    });
  }

  async findAllExamenes(filters: any = {}) {
    const { materiaId, fechaDesde, fechaHasta, page = 1, limit = 10 } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (materiaId) where.materiaId = materiaId;
    if (fechaDesde || fechaHasta) {
      where.fecha = {};
      if (fechaDesde) where.fecha.gte = new Date(fechaDesde);
      if (fechaHasta) where.fecha.lte = new Date(fechaHasta);
    }

    const [examenes, total] = await Promise.all([
      prisma.examen.findMany({
        where,
        skip,
        take: limit,
        orderBy: { fecha: 'desc' },
        include: {
          materia: {
            select: {
              id: true,
              nombre: true,
              codigo: true
            }
          },
          tribunales: {
            include: {
              profesor: {
                select: {
                  id: true,
                  apellidoNombre: true
                }
              }
            }
          },
          _count: {
            select: {
              inscripciones: true
            }
          }
        }
      }),
      prisma.examen.count({ where })
    ]);

    return {
      data: examenes,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
  }

  async updateExamen(id: number, data: ExamenUpdateData): Promise<any> {
    const cleanData: any = { ...data };
    Object.keys(cleanData).forEach(key => {
      if (cleanData[key] === undefined) delete cleanData[key];
    });

    return await prisma.examen.update({
      where: { id },
      data: cleanData,
      include: {
        materia: true
      }
    });
  }

  async deleteExamen(id: number): Promise<any> {
    return await prisma.examen.update({
      where: { id },
      data: { activo: false }
    });
  }

  // ===== TRIBUNALES =====
  async addTribunal(data: TribunalCreateData): Promise<any> {
    return await prisma.tribunal.create({
      data: {
        examenId: data.examenId,
        profesorId: data.profesorId,
        rolTribunal: data.rolTribunal as any
      },
      include: {
        profesor: {
          select: {
            id: true,
            apellidoNombre: true,
            email: true
          }
        }
      }
    });
  }

  async removeTribunal(id: number): Promise<any> {
    return await prisma.tribunal.delete({
      where: { id }
    });
  }

  async getTribunalesByExamen(examenId: number): Promise<any[]> {
    return await prisma.tribunal.findMany({
      where: { examenId },
      include: {
        profesor: {
          select: {
            id: true,
            apellidoNombre: true,
            email: true
          }
        }
      }
    });
  }

  // ===== INSCRIPCIÓN A EXÁMENES =====
  async inscribirAlumno(examenId: number, alumnoId: number, condicion: string): Promise<any> {
    return await prisma.inscripcionExamen.create({
      data: {
        examenId,
        alumnoId,
        condicion: condicion as any,
        fechaInscripcion: new Date(),
        aprobado: false
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
        examen: {
          include: {
            materia: true
          }
        }
      }
    });
  }

  async desinscribirAlumno(examenId: number, alumnoId: number): Promise<any> {
    // Buscar la inscripción
    const inscripcion = await prisma.inscripcionExamen.findFirst({
      where: {
        examenId,
        alumnoId
      }
    });

    if (!inscripcion) {
      throw new Error('Inscripción no encontrada');
    }

    return await prisma.inscripcionExamen.update({
      where: { id: inscripcion.id },
      data: { fechaBaja: new Date() }
    });
  }

  async getInscriptosByExamen(examenId: number): Promise<any[]> {
    return await prisma.inscripcionExamen.findMany({
      where: {
        examenId,
        fechaBaja: null
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

  async getInscripcionesByAlumno(alumnoId: number): Promise<any[]> {
    return await prisma.inscripcionExamen.findMany({
      where: {
        alumnoId,
        fechaBaja: null
      },
      include: {
        examen: {
          include: {
            materia: true
          }
        }
      },
      orderBy: {
        fechaInscripcion: 'desc'
      }
    });
  }

  // ===== CALIFICACIONES =====
  async registrarNota(examenId: number, alumnoId: number, nota: number): Promise<any> {
    // Buscar la inscripción
    const inscripcion = await prisma.inscripcionExamen.findFirst({
      where: {
        examenId,
        alumnoId,
        fechaBaja: null
      }
    });

    if (!inscripcion) {
      throw new Error('Inscripción no encontrada');
    }

    return await prisma.inscripcionExamen.update({
      where: { id: inscripcion.id },
      data: {
        notaFinal: nota,
        aprobado: nota >= 6
      },
      include: {
        alumno: {
          select: {
            id: true,
            apellidoNombre: true,
            email: true
          }
        }
      }
    });
  }
}

export default new ExamenRepository();