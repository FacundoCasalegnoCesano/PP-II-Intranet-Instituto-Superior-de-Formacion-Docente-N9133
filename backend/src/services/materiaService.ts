import materiaRepository from '../repositories/materiaRepository.js';
import carreraRepository from '../repositories/carreraRepository.js';
import cursadaRepository from '../repositories/cursadaRepository.js';
import profesorMateriaRepository from '../repositories/profesorMateriaRepository.js';
import userRepository from '../repositories/userRepository.js';
import { AppError } from '../utils/AppError.js';
import type { MateriaFilters, MateriaCreateData, MateriaUpdateData } from '../repositories/materiaRepository.js';

class MateriaService {
  /**
   * Años de regularidad según tipo de espacio cuando el administrativo
   * no carga un valor explícito: seminarios y talleres 1 año, resto 3.
   */
  private resolverAniosRegularidad(
    tipoEspacio: string | null | undefined,
    aniosRegularidad?: number | null
  ): number {
    if (aniosRegularidad) return aniosRegularidad;
    return tipoEspacio === 'SEMINARIO' || tipoEspacio === 'TALLER' || tipoEspacio === 'TALLER_PRACTICA'
      ? 1
      : 3;
  }

  async createMateria(data: MateriaCreateData) {
    // Verificar que la carrera existe
    const carrera = await carreraRepository.findById(data.carreraId);
    if (!carrera) {
      throw new Error('Carrera no encontrada');
    }

    // Verificar nombre único
    const existing = await materiaRepository.findByNombre(data.nombre);
    if (existing) {
      throw new Error('Ya existe una materia con ese nombre');
    }

    const aniosRegularidad = this.resolverAniosRegularidad(data.tipoEspacio, data.aniosRegularidad);

    return await materiaRepository.create({ ...data, aniosRegularidad });
  }

  async getMateriaById(id: number) {
    const materia = await materiaRepository.findById(id);
    if (!materia) {
      throw new Error('Materia no encontrada');
    }
    return materia;
  }

  async listMaterias(filters: MateriaFilters = {}) {
    return await materiaRepository.findAll(filters);
  }

  async updateMateria(id: number, data: MateriaUpdateData) {
    const materia = await materiaRepository.findById(id);
    if (!materia) {
      throw new Error('Materia no encontrada');
    }

    // Verificar nombre único
    if (data.nombre && data.nombre !== materia.nombre) {
      const existing = await materiaRepository.findByNombre(data.nombre);
      if (existing) {
        throw new Error('Ya existe una materia con ese nombre');
      }
    }

    // Si cambia el tipo de espacio sin cargar años de regularidad,
    // se recalculan automáticamente (valor explícito = prioridad).
    if (data.tipoEspacio && data.aniosRegularidad === undefined) {
      data.aniosRegularidad = this.resolverAniosRegularidad(data.tipoEspacio, null);
    }

    return await materiaRepository.update(id, data);
  }

  async deleteMateria(id: number) {
    const materia = await materiaRepository.findById(id);
    if (!materia) {
      throw new Error('Materia no encontrada');
    }

    return await materiaRepository.delete(id);
  }

  async getMateriasByCarrera(carreraId: number) {
    const carrera = await carreraRepository.findById(carreraId);
    if (!carrera) {
      throw new Error('Carrera no encontrada');
    }

    return await materiaRepository.getMateriasByCarrera(carreraId);
  }

  /**
   * Materias de una carrera agrupadas por año de cursada (curso.anio),
   * para la pantalla de selección del período de inscripción
   * (carrera → año → materias).
   */
  async getMateriasPorAnio(carreraId: number) {
    const materias = await this.getMateriasByCarrera(carreraId);

    const grupos = new Map<number, any[]>();
    for (const m of materias) {
      // Sin curso asignado se agrupan bajo anio=0 ("sin año") para que el
      // admin igualmente pueda verlas y seleccionarlas
      const anio = m.curso?.anio ?? 0;
      if (!grupos.has(anio)) grupos.set(anio, []);
      grupos.get(anio)!.push(m);
    }

    return Array.from(grupos.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([anio, materias]) => ({
        anio: anio === 0 ? null : anio,
        cantidad: materias.length,
        materias: materias.map(({ curso, profesorMaterias, ...rest }: any) => rest)
      }));
  }

  async getCorrelatividades(materiaId: number) {
    const materia = await materiaRepository.findById(materiaId);
    if (!materia) {
      throw new Error('Materia no encontrada');
    }

    return await materiaRepository.getCorrelatividades(materiaId);
  }

  async addCorrelatividad(data: {
    materiaOrigenId: number;
    materiaRequeridaId: number;
    tipoRequisito: string;
    grupo?: string;
    cantidadMinimaAprobadas?: number;
    aplicaCursado?: boolean;
    aplicaRendir?: boolean;
  }) {
    // Verificar que ambas materias existen
    const origen = await materiaRepository.findById(data.materiaOrigenId);
    if (!origen) {
      throw new Error('Materia origen no encontrada');
    }

    const requerida = await materiaRepository.findById(data.materiaRequeridaId);
    if (!requerida) {
      throw new Error('Materia requerida no encontrada');
    }

    // Verificar que no sea la misma materia
    if (data.materiaOrigenId === data.materiaRequeridaId) {
      throw new Error('Una materia no puede ser correlativa de sí misma');
    }

    return await materiaRepository.addCorrelatividad(data);
  }

  async removeCorrelatividad(id: number) {
    return await materiaRepository.removeCorrelatividad(id);
  }

  // ============================================
  // ASIGNACIÓN PROFESOR ↔ MATERIA
  // ============================================

  private async verificarUsuarioProfesor(profesorId: number): Promise<void> {
    const usuario = await userRepository.findById(profesorId);
    if (!usuario) {
      throw new AppError(404, 'Usuario no encontrado');
    }

    const roles = (usuario.rol || '').split(',').map((r: string) => r.trim());
    if (!roles.includes('PROFESOR')) {
      throw new AppError(400, 'El usuario no tiene el rol PROFESOR');
    }
  }

  async asignarProfesor(materiaId: number, profesorId: number) {
    const materia = await materiaRepository.findById(materiaId);
    if (!materia) {
      throw new AppError(404, 'Materia no encontrada');
    }

    await this.verificarUsuarioProfesor(profesorId);

    const existing = await profesorMateriaRepository.findByProfesorAndMateria(profesorId, materiaId);
    if (existing && existing.activo && !existing.fechaBaja) {
      throw new AppError(400, 'El profesor ya está asignado a esta materia');
    }

    return await profesorMateriaRepository.asignar(profesorId, materiaId);
  }

  async desasignarProfesor(materiaId: number, profesorId: number) {
    const materia = await materiaRepository.findById(materiaId);
    if (!materia) {
      throw new AppError(404, 'Materia no encontrada');
    }

    await this.verificarUsuarioProfesor(profesorId);

    const existing = await profesorMateriaRepository.findByProfesorAndMateria(profesorId, materiaId);
    if (!existing || !existing.activo || existing.fechaBaja) {
      throw new AppError(404, 'El profesor no está asignado a esta materia');
    }

    return await profesorMateriaRepository.desasignar(profesorId, materiaId);
  }

  async getProfesoresByMateria(materiaId: number) {
    const materia = await materiaRepository.findById(materiaId);
    if (!materia) {
      throw new AppError(404, 'Materia no encontrada');
    }

    return await profesorMateriaRepository.findByMateria(materiaId);
  }

  // ============================================
  // MÉTODOS PARA MATERIAS DISPONIBLES (ALUMNOS)
  // ============================================

  async getMateriasDisponibles(alumnoId: number, cicloLectivo: number) {
    // `alumnoId` es el id de cuenta (Usuario.idUsuario). La tabla
    // InscripcionCarrera guarda usuarioId; las tablas de materias guardan idAlumno.
    const { prisma } = await import('../config/prisma.js');
    const { getAlumnoIdByUsuarioId } = await import('../utils/alumnoHelper.js');
    const idAlumno = await getAlumnoIdByUsuarioId(alumnoId);

    // Obtener carreras del alumno
    const inscripcionesCarreras = await prisma.inscripcionCarrera.findMany({
      where: {
        usuarioId: alumnoId,
        activo: true
      },
      include: {
        carrera: true
      }
    });

    if (inscripcionesCarreras.length === 0) {
      throw new Error('El alumno no está inscripto en ninguna carrera');
    }

    // Obtener materias de todas las carreras del alumno
    const carrerasIds = inscripcionesCarreras.map((ic: any) => ic.carreraId);
    
    const todasLasMaterias = await materiaRepository.getMateriasDisponibles(
      idAlumno,
      carrerasIds,
      cicloLectivo
    );

    // Agrupar por materia (si está en múltiples carreras)
    const materiasMap = new Map();
    for (const materia of todasLasMaterias) {
      if (materiasMap.has(materia.id)) {
        const existing = materiasMap.get(materia.id);
        existing.carreras = [...existing.carreras, materia.carrera];
      } else {
        materiasMap.set(materia.id, {
          ...materia,
          carreras: [materia.carrera]
        });
      }
    }

    // Flag habilitada: ¿hay período MATERIA vigente que incluya explícitamente
    // esta materia? La materia aparece igual, pero el frontend debe bloquear
    // la inscripción si habilitada=false.
    const materiasFinales = Array.from(materiasMap.values());
    const { default: periodoInscripcionRepository } = await import('../repositories/periodoInscripcionRepository.js');
    const habilitadas = await periodoInscripcionRepository.materiasHabilitadasEnPeriodoVigente(
      materiasFinales.map(materia => materia.id)
    );
    for (const materia of materiasFinales) materia.habilitada = habilitadas.has(materia.id);

    return materiasFinales;
  }

  async verificarInscripcion(alumnoId: number, materiaId: number, cicloLectivo: number) {
    // `alumnoId` es el id de cuenta (Usuario.idUsuario). InscripcionCarrera
    // guarda usuarioId; InscripcionMateria y Calificacion guardan idAlumno.
    const { prisma } = await import('../config/prisma.js');
    const { getAlumnoIdByUsuarioId } = await import('../utils/alumnoHelper.js');
    const idAlumno = await getAlumnoIdByUsuarioId(alumnoId);

    // Verificar que la materia existe
    const materia = await materiaRepository.findById(materiaId);
    if (!materia) {
      throw new Error('Materia no encontrada');
    }

    // Verificar que el alumno existe
    const userRepository = (await import('../repositories/userRepository.js')).default;
    const alumno = await userRepository.findById(alumnoId);
    if (!alumno) {
      throw new Error('Alumno no encontrado');
    }

    // Verificar que el alumno esté en la carrera de la materia
    const inscripcionCarrera = await prisma.inscripcionCarrera.findFirst({
      where: {
        usuarioId: alumnoId,
        carreraId: materia.carreraId,
        activo: true
      }
    });
    if (!inscripcionCarrera) {
      throw new Error('El alumno no está inscripto en la carrera de esta materia');
    }

    // Verificar que no esté ya inscripto
    const inscripcion = await prisma.inscripcionMateria.findFirst({
      where: {
        alumnoId: idAlumno,
        materiaId,
        cicloLectivo,
        estado: { in: ['ACTIVA', 'RECURSANDO'] }
      }
    });
    if (inscripcion) {
      throw new Error('El alumno ya está inscripto en esta materia');
    }

    // Verificar que no esté aprobada
    const aprobada = await prisma.calificacion.findFirst({
      where: {
        alumnoId: idAlumno,
        cursada: {
          materiaId
        },
        nota: { gte: 6 }
      }
    });
    if (aprobada) {
      throw new Error('El alumno ya aprobó esta materia');
    }

    // Verificar correlatividades
    const materiasDisponibles = await this.getMateriasDisponibles(alumnoId, cicloLectivo);
    const materiaDisponible = materiasDisponibles.find((m: any) => m.id === materiaId);
    
    if (!materiaDisponible) {
      throw new Error('No se puede inscribir a esta materia');
    }

    if (!materiaDisponible.cumpleCorrelativas) {
      const pendientes = materiaDisponible.correlativasPendientes || [];
      const mensaje = pendientes.map((p: any) => {
        if (p.nombre) {
          return `Falta: ${p.nombre}`;
        } else if (p.grupo) {
          return `Falta alguna alternativa del grupo: ${p.grupo}`;
        }
        return '';
      }).filter(Boolean).join(', ');
      throw new Error(`No cumple con las correlatividades: ${mensaje}`);
    }

    return {
      puedeInscribirse: true,
      materia: materiaDisponible
    };
  }
}

export default new MateriaService();
