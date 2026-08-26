import { prisma } from '../config/prisma.js';
import type { CorrelatividadSnapshot } from '../domain/academico/correlatividades.js';

export type CorrelatividadConMateria = CorrelatividadSnapshot<{
  id: number;
  nombre: string;
  carrera: { id: number; nombre: string };
}> & {
  id: number;
  materiaOrigenId: number;
  tipoRequisito: 'OBLIGATORIA';
};

export interface MateriaFilters {
  page?: number;
  limit?: number;
  search?: string;
  carreraId?: number;
  tipoEspacio?: string;
  activo?: boolean;
}

export interface MateriaCreateData {
  nombre: string;
  descripcion?: string | null;
  cargaHoraria: number;
  horasCatedra?: string | null;
  tipoEspacio: string;
  modalidad?: string | null;
  periodo?: string | null;
  regimen?: string | null;
  notaMinima?: number | null;
  asistenciaRequerida?: number | null;
  tpRequeridos?: number | null;
  esPromocionable?: boolean;
  notaPromocion?: number | null;
  aniosRegularidad?: number | null;
  carreraId: number;
  cursoId?: number | null;
  espacioCurricularId?: number | null;
}

export interface MateriaUpdateData {
  nombre?: string;
  descripcion?: string | null;
  cargaHoraria?: number;
  horasCatedra?: string | null;
  tipoEspacio?: string;
  modalidad?: string | null;
  periodo?: string | null;
  regimen?: string | null;
  notaMinima?: number | null;
  asistenciaRequerida?: number | null;
  tpRequeridos?: number | null;
  esPromocionable?: boolean;
  notaPromocion?: number | null;
  aniosRegularidad?: number | null;
  carreraId?: number;
  cursoId?: number | null;
  espacioCurricularId?: number | null;
  activo?: boolean;
}

class MateriaRepository {
  async create(data: MateriaCreateData): Promise<any> {
    const cleanData: any = {
      nombre: data.nombre,
      cargaHoraria: data.cargaHoraria,
      tipoEspacio: data.tipoEspacio as any,
      carreraId: data.carreraId,
      activo: true
    };

    if (data.descripcion !== undefined) cleanData.descripcion = data.descripcion ?? null;
    if (data.horasCatedra !== undefined) cleanData.horasCatedra = data.horasCatedra ?? null;
    if (data.modalidad !== undefined) cleanData.modalidad = data.modalidad as any ?? null;
    if (data.periodo !== undefined) cleanData.periodo = data.periodo as any ?? null;
    if (data.regimen !== undefined) cleanData.regimen = data.regimen as any ?? null;
    if (data.notaMinima !== undefined) cleanData.notaMinima = data.notaMinima ?? null;
    if (data.asistenciaRequerida !== undefined) cleanData.asistenciaRequerida = data.asistenciaRequerida ?? null;
    if (data.tpRequeridos !== undefined) cleanData.tpRequeridos = data.tpRequeridos ?? null;
    if (data.esPromocionable !== undefined) cleanData.esPromocionable = data.esPromocionable;
    if (data.notaPromocion !== undefined) cleanData.notaPromocion = data.notaPromocion ?? null;
    if (data.aniosRegularidad !== undefined) cleanData.aniosRegularidad = data.aniosRegularidad ?? null;
    if (data.cursoId !== undefined) cleanData.cursoId = data.cursoId ?? null;
    if (data.espacioCurricularId !== undefined) cleanData.espacioCurricularId = data.espacioCurricularId ?? null;

    return await prisma.materia.create({
      data: cleanData,
      include: {
        carrera: true,
        curso: true
      }
    });
  }

  async findById(id: number): Promise<any> {
    return await prisma.materia.findUnique({
      where: { id },
      include: {
        carrera: true,
        curso: true,
        espacioCurricular: true,
        correlatividadesOrigen: {
          where: { tipoRequisito: 'OBLIGATORIA' },
          include: {
            materiaRequerida: true
          }
        },
        correlatividadesRequeridas: {
          where: { tipoRequisito: 'OBLIGATORIA' },
          include: {
            materiaOrigen: true
          }
        },
        profesorMaterias: {
          where: { activo: true },
          include: {
            profesor: {
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

  async findAll(filters: MateriaFilters = {}) {
    const { search, carreraId, tipoEspacio, activo, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search) {
      where.OR = [
        { nombre: { contains: search } }
      ];
    }
    if (carreraId) where.carreraId = carreraId;
    if (tipoEspacio) where.tipoEspacio = tipoEspacio;
    if (activo !== undefined) where.activo = activo;

    const [materias, total] = await Promise.all([
      prisma.materia.findMany({
        where,
        skip,
        take: limit,
        orderBy: { nombre: 'asc' },
        include: {
          carrera: {
            select: {
              id: true,
              nombre: true
            }
          },
          curso: {
            select: {
              id: true,
              anio: true,
              descripcion: true
            }
          },
          espacioCurricular: {
            select: {
              id: true,
              nombre: true
            }
          },
          profesorMaterias: {
            where: { activo: true },
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
              inscripciones: true,
              mesas: true
            }
          }
        }
      }),
      prisma.materia.count({ where })
    ]);

    return {
      data: materias,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async update(id: number, data: MateriaUpdateData): Promise<any> {
    const cleanData: any = { ...data };
    Object.keys(cleanData).forEach(key => {
      if (cleanData[key] === undefined) delete cleanData[key];
    });

    return await prisma.materia.update({
      where: { id },
      data: cleanData,
      include: {
        carrera: true,
        curso: true
      }
    });
  }

  async delete(id: number): Promise<any> {
    return await prisma.materia.update({
      where: { id },
      data: { activo: false }
    });
  }

  async hardDelete(id: number): Promise<any> {
    return await prisma.materia.delete({
      where: { id }
    });
  }

  async findByNombre(nombre: string): Promise<any> {
    return await prisma.materia.findFirst({
      where: { nombre }
    });
  }

  async getMateriasByCarrera(carreraId: number): Promise<any> {
    return await prisma.materia.findMany({
      where: {
        carreraId,
        activo: true
      },
      orderBy: { nombre: 'asc' },
      include: {
        curso: true,
        profesorMaterias: {
          where: { activo: true },
          include: {
            profesor: {
              select: {
                idUsuario: true,
                apellidoNombre: true
              }
            }
          }
        }
      }
    });
  }

  async getCorrelatividades(materiaId: number): Promise<CorrelatividadConMateria[]> {
    const correlatividades = await prisma.correlatividad.findMany({
      where: {
        materiaOrigenId: materiaId,
        tipoRequisito: 'OBLIGATORIA'
      },
      include: {
        materiaRequerida: {
          include: {
            carrera: true
          }
        }
      }
    });

    return correlatividades.map(correlatividad => ({
      id: correlatividad.id,
      materiaOrigenId: correlatividad.materiaOrigenId,
      materiaRequeridaId: correlatividad.materiaRequeridaId,
      materiaRequerida: correlatividad.materiaRequerida,
      tipoRequisito: 'OBLIGATORIA',
      aplicaCursado: correlatividad.aplicaCursado,
      aplicaRendir: correlatividad.aplicaRendir
    }));
  }

  async addCorrelatividad(data: {
    materiaOrigenId: number;
    materiaRequeridaId: number;
    tipoRequisito: 'OBLIGATORIA';
    aplicaCursado?: boolean;
    aplicaRendir?: boolean;
  }): Promise<any> {
    return await prisma.correlatividad.create({
      data: {
        materiaOrigenId: data.materiaOrigenId,
        materiaRequeridaId: data.materiaRequeridaId,
        tipoRequisito: data.tipoRequisito,
        aplicaCursado: data.aplicaCursado ?? true,
        aplicaRendir: data.aplicaRendir ?? true
      }
    });
  }

  async removeCorrelatividad(id: number): Promise<any> {
    return await prisma.correlatividad.delete({
      where: { id }
    });
  }

  // ============================================
  // MÉTODOS PARA MATERIAS DISPONIBLES (ALUMNOS)
  // ============================================

  async getMateriasDisponibles(alumnoId: number, carreraIds: number[], cicloLectivo: number) {
    const materias = await prisma.materia.findMany({
      where: {
        carreraId: { in: carreraIds },
        activo: true
      },
      include: {
        carrera: true,
        curso: true,
        cursadas: {
          where: { activo: true },
          include: {
            horarios: {
              where: { activo: true },
              include: {
                cursada: true
              }
            }
          }
        },
        correlatividadesOrigen: {
          where: { tipoRequisito: 'OBLIGATORIA' },
          include: {
            materiaRequerida: true
          }
        }
      },
      orderBy: { nombre: 'asc' }
    });

    const inscripciones = await prisma.inscripcionMateria.findMany({
      where: {
        alumnoId,
        cicloLectivo,
        estado: { in: ['ACTIVA', 'RECURSANDO'] }
      },
      select: { materiaId: true }
    });
    const materiasInscriptasIds = inscripciones.map(i => i.materiaId);

    const aprobadas = await prisma.calificacion.findMany({
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
      }
    });
    const materiasAprobadasIds = aprobadas.map(c => c.cursada.materiaId);

    return {
      materias,
      materiasInscriptasIds,
      materiasAprobadasIds
    };
  }

  async getHorariosByMateriaAndCiclo(materiaId: number, cicloLectivo: number): Promise<any> {
    return await prisma.horario.findMany({
      where: {
        cursada: {
          materiaId,
          anioLectivo: cicloLectivo,
          activo: true
        },
        activo: true
      },
      include: {
        cursada: {
          include: {
            materia: true,
            docente: {
              select: {
                idUsuario: true,
                apellidoNombre: true,
                email: true
              }
            }
          }
        }
      },
      orderBy: [
        { dia: 'asc' },
        { horaInicio: 'asc' }
      ]
    });
  }
}

export default new MateriaRepository();
