import { prisma } from '../config/prisma.js';

export interface ExamenCreateData {
  materiaId: number;
  fecha: Date;
  tipoExamen: string;
  llamado: number;
  folioExamen?: string | null;
  libroExamen?: string | null;
}

export interface ExamenUpdateData {
  fecha?: Date;
  tipoExamen?: string;
  llamado?: number;
  folioExamen?: string | null;
  libroExamen?: string | null;
  estadoMesa?: string;
  activo?: boolean;
}

export interface TribunalCreateData {
  examenId: number;
  profesorId: number;
  rolTribunal: string;
}

class ExamenRepository {
  // ===== MESAS (EXÁMENES) =====
  async createExamen(data: ExamenCreateData): Promise<any> {
    return await prisma.mesa.create({
      data: {
        materiaId: data.materiaId,
        fecha: data.fecha,
        tipoExamen: data.tipoExamen as any,
        llamado: data.llamado,
        folioExamen: data.folioExamen ?? null,
        libroExamen: data.libroExamen ?? null,
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
    return await prisma.mesa.findUnique({
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
                idUsuario: true,
                apellidoNombre: true,
                email: true
              }
            }
          }
        },
        inscripciones: {
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
      prisma.mesa.findMany({
        where,
        skip,
        take: limit,
        orderBy: { fecha: 'desc' },
        include: {
          materia: {
            select: {
              id: true,
              nombre: true
            }
          },
          tribunales: {
            include: {
              profesor: {
                select: {
                  idUsuario: true,
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
      prisma.mesa.count({ where })
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

    return await prisma.mesa.update({
      where: { id },
      data: cleanData,
      include: {
        materia: true
      }
    });
  }

  async deleteExamen(id: number): Promise<any> {
    return await prisma.mesa.update({
      where: { id },
      data: { activo: false }
    });
  }

  // ===== TRIBUNALES =====
  async addTribunal(data: TribunalCreateData): Promise<any> {
    return await prisma.mesaTribunal.create({
      data: {
        mesaId: data.examenId,
        profesorId: data.profesorId,
        rolTribunal: data.rolTribunal as any
      },
      include: {
        profesor: {
          select: {
            idUsuario: true,
            apellidoNombre: true,
            email: true
          }
        }
      }
    });
  }

  async removeTribunal(id: number): Promise<any> {
    return await prisma.mesaTribunal.delete({
      where: { id }
    });
  }

  async getTribunalesByExamen(mesaId: number): Promise<any[]> {
    return await prisma.mesaTribunal.findMany({
      where: { mesaId },
      include: {
        profesor: {
          select: {
            idUsuario: true,
            apellidoNombre: true,
            email: true
          }
        }
      }
    });
  }

  // ===== INSCRIPCIÓN A EXÁMENES =====
  async inscribirAlumno(mesaId: number, alumnoId: number, condicion: string): Promise<any> {
    return await prisma.inscripcionExamen.create({
      data: {
        mesaId,
        alumnoId,
        condicion: condicion as any,
        fechaInscripcion: new Date(),
        aprobado: false
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
        mesa: {
          include: {
            materia: true
          }
        }
      }
    });
  }

  async desinscribirAlumno(mesaId: number, alumnoId: number): Promise<any> {
    const inscripcion = await prisma.inscripcionExamen.findFirst({
      where: {
        mesaId,
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

  async getInscriptosByExamen(mesaId: number): Promise<any[]> {
    return await prisma.inscripcionExamen.findMany({
      where: {
        mesaId,
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
        mesa: {
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
  async registrarNota(mesaId: number, alumnoId: number, nota: number): Promise<any> {
    const inscripcion = await prisma.inscripcionExamen.findFirst({
      where: {
        mesaId,
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
          include: {
            usuario: {
              select: {
                idUsuario: true,
                apellidoNombre: true,
                email: true
              }
            }
          }
        }
      }
    });
  }
}

export default new ExamenRepository();