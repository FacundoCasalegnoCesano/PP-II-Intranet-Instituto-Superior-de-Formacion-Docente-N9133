import materiaRepository from '../repositories/materiaRepository.js';
import type { Prisma } from '@prisma/client';
import carreraRepository from '../repositories/carreraRepository.js';
import cursadaRepository from '../repositories/cursadaRepository.js';
import profesorMateriaRepository from '../repositories/profesorMateriaRepository.js';
import userRepository from '../repositories/userRepository.js';
import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/AppError.js';
import { ROLES } from '../constants/roles.js';
import { getAlumnoIdByUsuarioId } from '../utils/alumnoHelper.js';
import type { MateriaFilters, MateriaCreateData, MateriaUpdateData } from '../repositories/materiaRepository.js';
import { evaluarCorrelatividades } from '../domain/academico/correlatividades.js';
import { verificarPermisoMateria } from '../utils/docenteHelper.js';

type MateriasDisponiblesFacts = Awaited<ReturnType<typeof materiaRepository.getMateriasDisponibles>>;
type MateriaDisponibleBase = MateriasDisponiblesFacts['materias'][number];
type MateriaRequeridaDisponible = MateriaDisponibleBase['correlatividadesOrigen'][number]['materiaRequerida'];
type MateriaDisponibleEvaluada = MateriaDisponibleBase & {
  yaInscripto: boolean;
  yaAprobada: boolean;
  cumpleCorrelativas: boolean;
  correlativasPendientes: MateriaRequeridaDisponible[];
  carreras: MateriaDisponibleBase['carrera'][];
  habilitada?: boolean;
};

class MateriaService {
  private normalizeName(nombre: string): string {
    return nombre.trim().replace(/\s+/g, ' ');
  }

  private validateCourseYear(cursoAnio: number, duracionAnios: number): void {
    if (!Number.isInteger(cursoAnio) || cursoAnio < 1 || cursoAnio > duracionAnios) {
      throw new AppError(400, `El año de la materia debe estar entre 1 y ${duracionAnios}, según la duración de la carrera`);
    }
  }

  private async resolveCourseId(
    carrera: { id: number; nombre: string; duracionAnios: number },
    data: { cursoAnio?: number; cursoId?: number | null },
    tx?: Prisma.TransactionClient
  ): Promise<number> {
    if (data.cursoAnio !== undefined) {
      this.validateCourseYear(data.cursoAnio, carrera.duracionAnios);
      return await materiaRepository.resolveCursoId(carrera.id, carrera.nombre, data.cursoAnio, tx);
    }

    if (data.cursoId !== undefined && data.cursoId !== null) {
      const curso = await materiaRepository.findCourseById(data.cursoId, tx);
      if (!curso) throw new AppError(400, 'Curso no encontrado');
      this.validateCourseYear(curso.anio, carrera.duracionAnios);
      return curso.id;
    }

    throw new AppError(400, 'cursoAnio o cursoId es requerido');
  }

  private createsCorrelationCycle(
    originId: number,
    requiredId: number,
    edges: Array<{ materiaOrigenId: number; materiaRequeridaId: number }>
  ): boolean {
    const dependencies = new Map<number, number[]>();
    for (const edge of edges) {
      const current = dependencies.get(edge.materiaOrigenId) ?? [];
      current.push(edge.materiaRequeridaId);
      dependencies.set(edge.materiaOrigenId, current);
    }

    const pending = [requiredId];
    const visited = new Set<number>();
    while (pending.length > 0) {
      const current = pending.pop()!;
      if (current === originId) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      pending.push(...(dependencies.get(current) ?? []));
    }
    return false;
  }

  private async validarConjuntoCorrelativas(
    materiaOrigenId: number,
    carreraId: number,
    correlativasIds: number[],
    tx: Prisma.TransactionClient
  ): Promise<void> {
    if (new Set(correlativasIds).size !== correlativasIds.length) {
      throw new AppError(400, 'No se pueden repetir correlativas');
    }

    const requeridas = await Promise.all(
      correlativasIds.map(id => materiaRepository.findById(id, tx))
    );
    for (let i = 0; i < correlativasIds.length; i += 1) {
      const requerida = requeridas[i];
      const requeridaId = correlativasIds[i];
      if (!requerida) throw new AppError(400, 'Materia correlativa no encontrada');
      if (requerida.activo === false) {
        throw new AppError(400, 'No se puede usar una materia inactiva como correlativa');
      }
      if (requeridaId === materiaOrigenId) {
        throw new AppError(400, 'Una materia no puede ser correlativa de sí misma');
      }
      if (requerida.carreraId !== carreraId) {
        throw new AppError(400, 'Las correlatividades deben pertenecer a la misma carrera');
      }
    }

    const edges = (await materiaRepository.getCorrelativityEdges(carreraId, tx))
      .filter(edge => edge.materiaOrigenId !== materiaOrigenId);
    const candidateEdges = [
      ...edges,
      ...correlativasIds.map(materiaRequeridaId => ({ materiaOrigenId, materiaRequeridaId }))
    ];
    for (const materiaRequeridaId of correlativasIds) {
      if (this.createsCorrelationCycle(materiaOrigenId, materiaRequeridaId, candidateEdges)) {
        throw new AppError(400, 'La correlatividad generaría un ciclo');
      }
    }
  }

  private async validarGrafoFinalMateria(
    materiaId: number,
    carreraFinalId: number,
    salientesFinales: number[],
    tx: Prisma.TransactionClient
  ): Promise<void> {
    const incidentes = await materiaRepository.getIncidentCorrelativityEdges(materiaId, tx);
    const aristasFinales = [
      ...incidentes.filter(edge => edge.materiaOrigenId !== materiaId),
      ...salientesFinales.map(materiaRequeridaId => ({
        materiaOrigenId: materiaId,
        materiaRequeridaId
      }))
    ];
    const idsRelacionados = new Set<number>();
    for (const arista of aristasFinales) {
      idsRelacionados.add(arista.materiaOrigenId);
      idsRelacionados.add(arista.materiaRequeridaId);
    }
    idsRelacionados.delete(materiaId);

    const materiasRelacionadas = new Map<number, any>();
    for (const idRelacionado of idsRelacionados) {
      const materia = await materiaRepository.findById(idRelacionado, tx);
      if (!materia) throw new AppError(400, 'Materia relacionada no encontrada');
      materiasRelacionadas.set(idRelacionado, materia);
    }

    for (const arista of aristasFinales) {
      const carreraOrigen = arista.materiaOrigenId === materiaId
        ? carreraFinalId
        : materiasRelacionadas.get(arista.materiaOrigenId)?.carreraId;
      const carreraRequerida = arista.materiaRequeridaId === materiaId
        ? carreraFinalId
        : materiasRelacionadas.get(arista.materiaRequeridaId)?.carreraId;
      if (carreraOrigen !== carreraRequerida) {
        throw new AppError(
          409,
          'El cambio de carrera dejaría una correlatividad entre carreras distintas'
        );
      }
    }
  }

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

    const nombre = this.normalizeName(data.nombre);
    const aniosRegularidad = this.resolverAniosRegularidad(data.tipoEspacio, data.aniosRegularidad);
    const { cursoAnio: _cursoAnio, correlativasIds, ...persistable } = data;

    return await materiaRepository.withTransaction(async tx => {
      const existing = await materiaRepository.findByCareerAndName(data.carreraId, nombre, undefined, tx);
      if (existing) {
        throw new AppError(409, 'Ya existe una materia con ese nombre en la carrera');
      }

      const cursoId = await this.resolveCourseId(carrera, data, tx);
      const materia = await materiaRepository.create(
        { ...persistable, nombre, cursoId, aniosRegularidad },
        tx
      );

      if (correlativasIds !== undefined) {
        await this.validarConjuntoCorrelativas(materia.id, materia.carreraId, correlativasIds, tx);
      }
      await this.validarGrafoFinalMateria(materia.id, materia.carreraId, correlativasIds ?? [], tx);
      if (correlativasIds !== undefined) {
        await materiaRepository.replaceCorrelatividades(materia.id, correlativasIds, tx);
      }

      return await materiaRepository.findById(materia.id, tx);
    });
  }

  async getMateriaById(id: number, currentUser?: any) {
    const materia = await materiaRepository.findById(id);
    if (!materia) {
      throw new Error('Materia no encontrada');
    }
    if (currentUser?.rol === ROLES.PROFESOR) await verificarPermisoMateria(currentUser, id);
    return materia;
  }

  async listMaterias(filters: MateriaFilters = {}, currentUser?: any) {
    if (currentUser?.rol === ROLES.PROFESOR) filters = { ...filters, profesorId: currentUser.id };
    return await materiaRepository.findAll(filters);
  }

  async updateMateria(id: number, data: MateriaUpdateData) {
    const materia = await materiaRepository.findById(id);
    if (!materia) {
      throw new Error('Materia no encontrada');
    }

    const carreraId = data.carreraId ?? materia.carreraId;
    const carrera = await carreraRepository.findById(carreraId);
    if (!carrera) throw new AppError(404, 'Carrera no encontrada');

    const nombre = data.nombre === undefined ? materia.nombre : this.normalizeName(data.nombre);

    // Si cambia el tipo de espacio sin cargar años de regularidad,
    // se recalculan automáticamente (valor explícito = prioridad).
    const aniosRegularidad = data.tipoEspacio && data.aniosRegularidad === undefined
      ? this.resolverAniosRegularidad(data.tipoEspacio, null)
      : data.aniosRegularidad;
    const { cursoAnio: _cursoAnio, correlativasIds, ...persistable } = data;

    return await materiaRepository.withTransaction(async tx => {
      if (nombre !== materia.nombre || carreraId !== materia.carreraId) {
        const existing = await materiaRepository.findByCareerAndName(carreraId, nombre, id, tx);
        if (existing) {
          throw new AppError(409, 'Ya existe una materia con ese nombre en la carrera');
        }
      }

      let cursoId = data.cursoId;
      if (data.cursoAnio !== undefined || data.cursoId !== undefined) {
        cursoId = await this.resolveCourseId(carrera, data, tx);
      } else if (carreraId !== materia.carreraId && materia.curso?.anio) {
        cursoId = await this.resolveCourseId(carrera, { cursoAnio: materia.curso.anio }, tx);
      }

      const incidentes = await materiaRepository.getIncidentCorrelativityEdges(id, tx);
      const salientesFinales = correlativasIds ?? incidentes
        .filter(edge => edge.materiaOrigenId === id)
        .map(edge => edge.materiaRequeridaId);

      const actualizada = await materiaRepository.update(id, {
        ...persistable,
        ...(aniosRegularidad !== undefined ? { aniosRegularidad } : {}),
        nombre,
        carreraId,
        ...(cursoId !== undefined ? { cursoId } : {})
      }, tx);

      if (correlativasIds !== undefined) {
        await this.validarConjuntoCorrelativas(id, carreraId, correlativasIds, tx);
      }
      await this.validarGrafoFinalMateria(id, carreraId, salientesFinales, tx);
      if (correlativasIds !== undefined) {
        await materiaRepository.replaceCorrelatividades(id, correlativasIds, tx);
      }

      return await materiaRepository.findById(actualizada.id, tx);
    });
  }

  async deleteMateria(id: number) {
    const materia = await materiaRepository.findById(id);
    if (!materia) {
      throw new Error('Materia no encontrada');
    }

    return await materiaRepository.delete(id);
  }

  async getMateriasByCarrera(carreraId: number, currentUser?: any) {
    const carrera = await carreraRepository.findById(carreraId);
    if (!carrera) {
      throw new Error('Carrera no encontrada');
    }

    return await materiaRepository.getMateriasByCarrera(carreraId, currentUser?.rol === ROLES.PROFESOR ? currentUser.id : undefined);
  }

  /**
   * Materias de una carrera agrupadas por año de cursada (curso.anio),
   * para la pantalla de selección del período de inscripción
   * (carrera → año → materias).
   */
  async getMateriasPorAnio(carreraId: number, currentUser?: any) {
    const materias = await this.getMateriasByCarrera(carreraId, currentUser);

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

  async getCorrelatividades(materiaId: number, currentUser?: any) {
    const materia = await materiaRepository.findById(materiaId);
    if (!materia) {
      throw new Error('Materia no encontrada');
    }
    if (currentUser?.rol === ROLES.PROFESOR) await verificarPermisoMateria(currentUser, materiaId);

    return await materiaRepository.getCorrelatividades(materiaId);
  }

  async addCorrelatividad(data: {
    materiaOrigenId: number;
    materiaRequeridaId: number;
    tipoRequisito?: 'OBLIGATORIA';
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

    if (origen.activo === false || requerida.activo === false) {
      throw new AppError(400, 'No se pueden relacionar materias inactivas');
    }

    // Verificar que no sea la misma materia
    if (data.materiaOrigenId === data.materiaRequeridaId) {
      throw new AppError(400, 'Una materia no puede ser correlativa de sí misma');
    }

    if (origen.carreraId !== requerida.carreraId) {
      throw new AppError(400, 'Las correlatividades deben pertenecer a la misma carrera');
    }

    const duplicate = await materiaRepository.findCorrelativity(
      data.materiaOrigenId,
      data.materiaRequeridaId
    );
    if (duplicate) {
      throw new AppError(409, 'La correlatividad ya existe');
    }

    const edges = await materiaRepository.getCorrelativityEdges(origen.carreraId);
    if (this.createsCorrelationCycle(data.materiaOrigenId, data.materiaRequeridaId, edges)) {
      throw new AppError(400, 'La correlatividad generaría un ciclo');
    }

    return await materiaRepository.addCorrelatividad({
      materiaOrigenId: data.materiaOrigenId,
      materiaRequeridaId: data.materiaRequeridaId
    });
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

  async getProfesoresByMateria(materiaId: number, currentUser?: any) {
    const materia = await materiaRepository.findById(materiaId);
    if (!materia) {
      throw new AppError(404, 'Materia no encontrada');
    }
    if (currentUser?.rol === ROLES.PROFESOR) await verificarPermisoMateria(currentUser, materiaId);

    return await profesorMateriaRepository.findByMateria(materiaId);
  }

  // ============================================
  // MÉTODOS PARA MATERIAS DISPONIBLES (ALUMNOS)
  // ============================================

  async getMateriasDisponibles(alumnoId: number, cicloLectivo: number) {
    // `alumnoId` es el id de cuenta (Usuario.idUsuario). La tabla
    // InscripcionCarrera guarda usuarioId; las tablas de materias guardan idAlumno.
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
    const carrerasIds = inscripcionesCarreras.map(ic => ic.carreraId);
    
    const hechos = await materiaRepository.getMateriasDisponibles(
      idAlumno,
      carrerasIds,
      cicloLectivo
    );

    // Agrupar por materia (si está en múltiples carreras)
    const materiasMap = new Map<number, MateriaDisponibleEvaluada>();
    for (const materia of hechos.materias) {
      const resultadoCorrelatividades = evaluarCorrelatividades({
        modo: 'MOSTRAR_DISPONIBILIDAD',
        correlatividades: materia.correlatividadesOrigen,
        materiasCumplidas: new Set(hechos.materiasAprobadasIds)
      });
      const correlativasPendientes = resultadoCorrelatividades.cumple
        ? []
        : resultadoCorrelatividades.pendientes.map(
            pendiente => pendiente.materiaRequerida
          );
      const materiaEvaluada: MateriaDisponibleEvaluada = {
        ...materia,
        yaInscripto: hechos.materiasInscriptasIds.includes(materia.id),
        yaAprobada: hechos.materiasAprobadasIds.includes(materia.id),
        cumpleCorrelativas: resultadoCorrelatividades.cumple,
        correlativasPendientes,
        carreras: [materia.carrera]
      };

      const existing = materiasMap.get(materia.id);
      if (existing) {
        existing.carreras = [...existing.carreras, materia.carrera];
      } else {
        materiasMap.set(materia.id, materiaEvaluada);
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
    const idAlumno = await getAlumnoIdByUsuarioId(alumnoId);

    // Verificar que la materia existe
    const materia = await materiaRepository.findById(materiaId);
    if (!materia) {
      throw new Error('Materia no encontrada');
    }

    // Verificar que el alumno existe
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
      const mensaje = pendientes
        .map((pendiente: MateriaRequeridaDisponible) => `Falta: ${pendiente.nombre}`)
        .join(', ');
      throw new Error(`No cumple con las correlatividades: ${mensaje}`);
    }

    return {
      puedeInscribirse: true,
      materia: materiaDisponible
    };
  }
}

export default new MateriaService();
