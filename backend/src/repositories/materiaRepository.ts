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
  descripcion?: string;
  codigo?: string;
  cargaHoraria: number;
  horasCatedra?: string;
  tipoEspacio: string;
  modalidad?: string;
  periodo?: string;
  regimen?: string;
  notaMinima?: number;
  asistenciaRequerida?: number;
  tpRequeridos?: number;
  esPromocionable?: boolean;
  notaPromocion?: number;
  aniosRegularidad?: number;
  carreraId: number;
  cursoId?: number;
  espacioCurricularId?: number;
}

export interface MateriaUpdateData {
  nombre?: string;
  descripcion?: string;
  codigo?: string;
  cargaHoraria?: number;
  horasCatedra?: string;
  tipoEspacio?: string;
  modalidad?: string;
  periodo?: string;
  regimen?: string;
  notaMinima?: number;
  asistenciaRequerida?: number;
  tpRequeridos?: number;
  esPromocionable?: boolean;
  notaPromocion?: number;
  aniosRegularidad?: number;
  carreraId?: number;
  cursoId?: number;
  espacioCurricularId?: number;
  activo?: boolean;
}

class MateriaRepository {
  async create(data: MateriaCreateData): Promise<any> {
    return await prisma.materia.create({
      data: {
        nombre: data.nombre,
        descripcion: data.descripcion,
        codigo: data.codigo,
        cargaHoraria: data.cargaHoraria,
        horasCatedra: data.horasCatedra,
        tipoEspacio: data.tipoEspacio as any,
        modalidad: data.modalidad as any,
        periodo: data.periodo as any,
        regimen: data.regimen as any,
        notaMinima: data.notaMinima,
        asistenciaRequerida: data.asistenciaRequerida,
        tpRequeridos: data.tpRequeridos,
        esPromocionable: data.esPromocionable,
        notaPromocion: data.notaPromocion,
        aniosRegularidad: data.aniosRegularidad,
        carreraId: data.carreraId,
        cursoId: data.cursoId,
        espacioCurricularId: data.espacioCurricularId
      },
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
                id: true,
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
        { nombre: { contains: search } },
        { codigo: { contains: search } }
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
                  id: true,
                  apellidoNombre: true
                }
              }
            }
          },
          _count: {
            select: {
              inscripciones: true,
              examenes: true
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
    return await prisma.materia.findUnique({
      where: { nombre }
    });
  }

  async findByCodigo(codigo: string): Promise<any> {
    return await prisma.materia.findUnique({
      where: { codigo }
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
                id: true,
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
    grupo?: string;
    cantidadMinimaAprobadas?: number;
    aplicaCursado?: boolean;
    aplicaRendir?: boolean;
  }): Promise<any> {
    return await prisma.correlatividad.create({
      data: {
        materiaOrigenId: data.materiaOrigenId,
        materiaRequeridaId: data.materiaRequeridaId,
        tipoRequisito: data.tipoRequisito as any,
        grupo: data.grupo,
        cantidadMinimaAprobadas: data.cantidadMinimaAprobadas,
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

  async getMateriasDisponibles(alumnoId: number, carreraId: number, cicloLectivo: number): Promise<any> {
    // Obtener materias de la carrera del alumno
    const materias = await prisma.materia.findMany({
      where: {
        carreraId,
        activo: true
      },
      include: {
        curso: true,
        horarios: {
          where: { activo: true },
          include: {
            cursada: true
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

    // Obtener materias en las que el alumno ya está inscripto
    const inscripciones = await prisma.inscripcionMateria.findMany({
      where: {
        alumnoId,
        cicloLectivo,
        estado: { in: ['ACTIVA', 'RECURSANDO'] }
      },
      select: { materiaId: true }
    });
    const materiasInscriptasIds = inscripciones.map((i: any) => i.materiaId);

    // Obtener materias aprobadas del alumno (nota >= 6)
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

    // Marcar cada materia con su estado
    return materias.map((materia: any) => {
      const yaInscripto = materiasInscriptasIds.includes(materia.id);
      const yaAprobada = materiasAprobadasIds.includes(materia.id);
      
      // Verificar correlatividades
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
          // Buscar alternativas del mismo grupo
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
        horarios: materia.horarios || []
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
                id: true,
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