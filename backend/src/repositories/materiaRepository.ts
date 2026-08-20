import { prisma } from '../config/prisma.js';

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
          include: {
            materiaRequerida: true
          }
        },
        correlatividadesRequeridas: {
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
    const { search, carreraId, tipoEspacio, activo, page = 1, limit = 10 } = filters;
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

  async getCorrelatividades(materiaId: number): Promise<any> {
    return await prisma.correlatividad.findMany({
      where: {
        materiaOrigenId: materiaId
      },
      include: {
        materiaRequerida: {
          include: {
            carrera: true
          }
        }
      }
    });
  }

  async addCorrelatividad(data: {
    materiaOrigenId: number;
    materiaRequeridaId: number;
    tipoRequisito: string;
    grupo?: string | null;
    cantidadMinimaAprobadas?: number | null;
    aplicaCursado?: boolean;
    aplicaRendir?: boolean;
  }): Promise<any> {
    const cleanData: any = {
      materiaOrigenId: data.materiaOrigenId,
      materiaRequeridaId: data.materiaRequeridaId,
      tipoRequisito: data.tipoRequisito as any,
      aplicaCursado: data.aplicaCursado ?? true,
      aplicaRendir: data.aplicaRendir ?? true
    };
    if (data.grupo !== undefined) cleanData.grupo = data.grupo ?? null;
    if (data.cantidadMinimaAprobadas !== undefined) cleanData.cantidadMinimaAprobadas = data.cantidadMinimaAprobadas ?? null;

    return await prisma.correlatividad.create({
      data: cleanData
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

  async getMateriasDisponibles(alumnoId: number, carreraId: number, cicloLectivo: number): Promise<any> {
    const materias = await prisma.materia.findMany({
      where: {
        carreraId,
        activo: true
      },
      include: {
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
    const materiasInscriptasIds = inscripciones.map((i: any) => i.materiaId);

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
    const materiasAprobadasIds = aprobadas.map((c: any) => c.cursada.materiaId);

    return materias.map((materia: any) => {
      const yaInscripto = materiasInscriptasIds.includes(materia.id);
      const yaAprobada = materiasAprobadasIds.includes(materia.id);
      
      const correlativas = materia.correlatividadesOrigen || [];
      let cumpleCorrelativas = true;
      let correlativasPendientes: any[] = [];

      for (const corr of correlativas) {
        if (corr.tipoRequisito === 'OBLIGATORIA') {
          if (!materiasAprobadasIds.includes(corr.materiaRequeridaId)) {
            cumpleCorrelativas = false;
            correlativasPendientes.push(corr.materiaRequerida);
          }
        } else if (corr.tipoRequisito === 'ALTERNATIVA') {
          const alternativas = correlativas.filter((c: any) => 
            c.tipoRequisito === 'ALTERNATIVA' && c.grupo === corr.grupo
          );
          const tieneAlguna = alternativas.some((alt: any) => 
            materiasAprobadasIds.includes(alt.materiaRequeridaId)
          );
          if (!tieneAlguna) {
            cumpleCorrelativas = false;
            correlativasPendientes.push({
              grupo: corr.grupo,
              alternativas: alternativas.map((a: any) => a.materiaRequerida)
            });
          }
        }
      }

      return {
        ...materia,
        yaInscripto,
        yaAprobada,
        cumpleCorrelativas,
        correlativasPendientes,
        horarios: (materia.cursadas ?? []).flatMap((c: any) => c.horarios ?? [])
      };
    });
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