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
import estadoAcademicoService from './estadoAcademicoService.js';
import type { MateriaFilters, MateriaCreateData, MateriaUpdateData, CorrelatividadInput } from '../repositories/materiaRepository.js';
import { evaluarRequisitosAcademicos, type RequisitoAcademico } from '../domain/academico/correlatividadesEspacios.js';
import { evaluarCursada, type TrayectoriaSnapshot } from '../domain/academico/trayectoriaAcademica.js';
import { lockCareerForAcademicMutation } from './espacioComposicionLatch.js';
import espacioCurricularService from './espacioCurricularService.js';
import { verificarPermisoMateria } from '../utils/docenteHelper.js';
import { createsMixedCorrelationCycle, espacioNode, materiaNode } from '../utils/correlatividadGraph.js';
import { anioInstitucionalActual } from '../utils/cicloLectivo.js';

type MateriasDisponiblesFacts = Awaited<ReturnType<typeof materiaRepository.getMateriasDisponibles>>;
type MateriaDisponibleBase = MateriasDisponiblesFacts['materias'][number];
type CorrelativaPendienteDisponible =
  | { tipo: 'MATERIA'; id: number; nombre: string }
  | { tipo: 'ESPACIO'; id: number; nombre: string };

type MateriaDisponibleEvaluada = MateriaDisponibleBase & {
  yaInscripto: boolean;
  yaAprobada: boolean;
  cumpleCorrelativas: boolean;
  correlativasPendientes: CorrelativaPendienteDisponible[];
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

  private async validarCorrelatividadesTipadas(
    materiaOrigenId: number,
    carreraId: number,
    reglas: CorrelatividadInput[],
    tx: Prisma.TransactionClient,
    reemplazoCompleto: boolean
  ): Promise<void> {
    await lockCareerForAcademicMutation(tx, carreraId);
    const keys = reglas.map(rule => rule.materiaRequeridaId !== undefined
      ? `M:${rule.materiaRequeridaId}` : `E:${rule.espacioRequeridoId}`);
    if (new Set(keys).size !== keys.length) throw new AppError(400, 'No se pueden repetir correlativas');

    const additions = [];
    for (const rule of reglas) {
      const hasMatter = Number.isInteger(rule.materiaRequeridaId);
      const hasSpace = Number.isInteger(rule.espacioRequeridoId);
      if (hasMatter === hasSpace || (!rule.aplicaCursado && !rule.aplicaRendir)) {
        throw new AppError(400, 'Cada correlatividad requiere un destino y al menos una condición académica');
      }
      if (hasMatter) {
        const required = await tx.materia.findUnique({ where: { id: rule.materiaRequeridaId! }, select: { id: true, carreraId: true, activo: true } });
        if (!required || !required.activo) throw new AppError(400, 'Materia correlativa no encontrada o inactiva');
        if (required.id === materiaOrigenId) throw new AppError(400, 'Una materia no puede ser correlativa de sí misma');
        if (required.carreraId !== carreraId) throw new AppError(400, 'Las correlatividades deben pertenecer a la misma carrera');
        additions.push({ from: materiaNode(materiaOrigenId), to: materiaNode(required.id), kind: 'LEGACY' as const, aplicaCursado: rule.aplicaCursado, aplicaRendir: rule.aplicaRendir });
      } else {
        const required = await tx.espacioCurricular.findUnique({ where: { id: rule.espacioRequeridoId! }, select: { id: true, carreraId: true, activo: true, materias: { select: { id: true } } } });
        if (!required || !required.activo) throw new AppError(400, 'Espacio curricular correlativo no encontrado o inactivo');
        if (required.carreraId !== carreraId) throw new AppError(400, 'Las correlatividades deben pertenecer a la misma carrera');
        if (required.materias.some(materia => materia.id === materiaOrigenId)) throw new AppError(400, 'Una materia no puede requerir el espacio curricular al que pertenece');
        additions.push({ from: materiaNode(materiaOrigenId), to: espacioNode(required.id), kind: 'LEGACY' as const, aplicaCursado: rule.aplicaCursado, aplicaRendir: rule.aplicaRendir });
      }
    }

    const edges = (await materiaRepository.getMixedCorrelationEdges(carreraId, tx)).filter(edge =>
      edge.from !== materiaNode(materiaOrigenId) || edge.kind !== 'LEGACY' || (!reemplazoCompleto && edge.to.startsWith('S:'))
    );
    if (createsMixedCorrelationCycle(edges, additions)) throw new AppError(400, 'La correlatividad generaría un ciclo');
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

  private async validarCarreraCorrelatividadesMateria(materiaId: number, carreraFinalId: number, tx: Prisma.TransactionClient): Promise<void> {
    const [legacy, requisitosEspacio] = await Promise.all([
      tx.correlatividad.findMany({
        where: { tipoRequisito: 'OBLIGATORIA', OR: [{ materiaOrigenId: materiaId }, { materiaRequeridaId: materiaId }] },
        include: {
          materiaOrigen: { select: { id: true, carreraId: true } },
          materiaRequerida: { select: { id: true, carreraId: true } },
          espacioRequerido: { select: { carreraId: true } }
        }
      }),
      tx.espacioCorrelatividad.findMany({
        where: { materiaRequeridaId: materiaId },
        include: { espacioOrigen: { select: { carreraId: true } } }
      })
    ]);
    for (const rule of legacy) {
      const originCareerId = rule.materiaOrigenId === materiaId ? carreraFinalId : rule.materiaOrigen.carreraId;
      const targetCareerId = rule.materiaRequeridaId === materiaId
        ? carreraFinalId
        : rule.materiaRequerida ? rule.materiaRequerida.carreraId : rule.espacioRequerido?.carreraId;
      if (originCareerId !== targetCareerId) throw new AppError(409, 'El cambio de carrera dejaría una correlatividad entre carreras distintas');
    }
    for (const rule of requisitosEspacio) {
      if (rule.espacioOrigen.carreraId !== carreraFinalId) throw new AppError(409, 'El cambio de carrera dejaría una correlatividad de espacio entre carreras distintas');
    }
  }

  private async espaciosCompletadosPorCambioDeConfiguracion(
    tx: Prisma.TransactionClient,
    carreraId: number,
    materiaId: number
  ): Promise<Set<number>> {
    const spaces = await tx.espacioCurricular.findMany({
      where: { carreraId, composicionBloqueadaAt: null, materias: { some: { id: materiaId } } },
      select: { id: true, materias: { select: { id: true } } }
    });
    if (spaces.length === 0) return new Set();

    const affected = await tx.inscripcionMateria.findMany({
      where: { estado: { not: 'BAJA' }, cursada: { activo: true, materiaId } },
      select: { alumnoId: true },
      distinct: ['alumnoId']
    });
    const alumnoIds = affected.map(row => row.alumnoId);
    if (alumnoIds.length === 0) return new Set();

    const [exams, homologations, activeEnrollments] = await Promise.all([
      tx.inscripcionExamen.findMany({
        where: { alumnoId: { in: alumnoIds }, aprobado: true, fechaBaja: null },
        select: { alumnoId: true, mesa: { select: { materiaId: true } } }
      }),
      tx.homologacion.findMany({
        where: { alumnoId: { in: alumnoIds }, estado: 'APROBADA', calificacion: { not: null } },
        select: { alumnoId: true, materiaId: true }
      }),
      tx.inscripcionMateria.findMany({
        where: { alumnoId: { in: alumnoIds }, estado: { not: 'BAJA' }, cursada: { activo: true } },
        include: { cursada: { include: { materia: true, calificaciones: true, asistencias: true } } }
      })
    ]);
    const approvedByAlumno = new Map(alumnoIds.map(alumnoId => [alumnoId, new Set<number>()]));
    for (const exam of exams) approvedByAlumno.get(exam.alumnoId)?.add(exam.mesa.materiaId);
    for (const homologation of homologations) approvedByAlumno.get(homologation.alumnoId)?.add(homologation.materiaId);

    const evaluadoEn = new Date();
    for (const enrollment of activeEnrollments) {
      const cursada = enrollment.cursada;
      if (!cursada?.activo) continue;
      const snapshot: TrayectoriaSnapshot = {
        alumnoUsuarioId: enrollment.alumnoId,
        idAlumno: enrollment.alumnoId,
        cursada: {
          id: cursada.id,
          materiaId: cursada.materiaId,
          anioLectivo: cursada.anioLectivo,
          periodo: cursada.periodo,
          activo: cursada.activo
        },
        materia: {
          id: cursada.materia.id,
          nombre: cursada.materia.nombre,
          carreraId: cursada.materia.carreraId,
          notaMinima: cursada.materia.notaMinima,
          notaPromocion: cursada.materia.notaPromocion,
          asistenciaRequerida: cursada.materia.asistenciaRequerida,
          tpRequeridos: cursada.materia.tpRequeridos,
          esPromocionable: cursada.materia.esPromocionable,
          modalidad: cursada.materia.modalidad,
          regimen: cursada.materia.regimen,
          tipoEspacio: cursada.materia.tipoEspacio,
          aniosRegularidad: cursada.materia.aniosRegularidad
        },
        calificaciones: cursada.calificaciones,
        asistencias: cursada.asistencias
      };
      if (evaluarCursada(snapshot, evaluadoEn).estado === 'PROMOCIONADO') {
        approvedByAlumno.get(enrollment.alumnoId)?.add(cursada.materiaId);
      }
    }

    const latches = new Set<number>();
    for (const alumnoId of alumnoIds) {
      const approved = approvedByAlumno.get(alumnoId)!;
      for (const space of spaces) {
        if (space.materias.length >= 2 && space.materias.every(component => approved.has(component.id))) latches.add(space.id);
      }
    }
    return latches;
  }

  private async fijarLatchEspacios(tx: Prisma.TransactionClient, spaceIds: Set<number>): Promise<void> {
    for (const spaceId of spaceIds) {
      await tx.espacioCurricular.updateMany({
        where: { id: spaceId, composicionBloqueadaAt: null },
        data: { composicionBloqueadaAt: new Date() }
      });
    }
  }

  private async lockSpaceMembershipForMutation(
    tx: Prisma.TransactionClient,
    espacioCurricularId: number,
    carreraId: number
  ): Promise<void> {
    await tx.$queryRaw`SELECT id FROM espacios_curriculares WHERE id = ${espacioCurricularId} FOR UPDATE`;
    const space = await tx.espacioCurricular.findUnique({
      where: { id: espacioCurricularId },
      select: { id: true, carreraId: true, composicionBloqueadaAt: true }
    });
    if (!space) throw new AppError(404, 'Espacio curricular no encontrado');
    if (space.carreraId !== carreraId) throw new AppError(400, 'La materia debe pertenecer a la misma carrera que el espacio curricular');
    if (space.composicionBloqueadaAt) throw new AppError(409, 'No se puede cambiar la composición del espacio porque ya quedó bloqueada');

    const [activeOfferings, enrollments] = await Promise.all([
      tx.cursadaEspacio.count({ where: { espacioCurricularId, activo: true } }),
      tx.inscripcionEspacio.count({ where: { cursadaEspacio: { espacioCurricularId } } })
    ]);
    if (activeOfferings || enrollments) {
      throw new AppError(409, 'No se puede cambiar la composición: el espacio tiene ofertas activas o matrículas registradas');
    }
  }

  private async validateMembershipGraph(
    tx: Prisma.TransactionClient,
    carreraId: number,
    materiaId: number,
    nextSpaceId: number | null
  ): Promise<void> {
    const currentEdges = await materiaRepository.getMixedCorrelationEdges(carreraId, tx);
    const withoutCurrentMembership = currentEdges.filter(edge => !(edge.kind === 'MEMBERSHIP' && edge.from === materiaNode(materiaId)));
    const additions = nextSpaceId === null ? [] : [{
      from: materiaNode(materiaId), to: espacioNode(nextSpaceId), kind: 'MEMBERSHIP' as const,
      aplicaCursado: true, aplicaRendir: true
    }];
    if (createsMixedCorrelationCycle(withoutCurrentMembership, additions)) {
      throw new AppError(400, 'La composición generaría un ciclo con las correlatividades existentes');
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
    if (data.correlativasIds !== undefined && data.correlatividades !== undefined) throw new AppError(400, 'Usá correlativasIds o correlatividades, no ambos campos');
    const { cursoAnio: _cursoAnio, correlativasIds, correlatividades, ...persistable } = data;
    const tieneReglas = correlativasIds !== undefined || correlatividades !== undefined;

    return await materiaRepository.withTransaction(async tx => {
      if (tieneReglas || data.espacioCurricularId != null) await lockCareerForAcademicMutation(tx, data.carreraId);
      if (data.espacioCurricularId != null) {
        await lockCareerForAcademicMutation(tx, data.carreraId);
        await this.lockSpaceMembershipForMutation(tx, data.espacioCurricularId, data.carreraId);
        if (correlativasIds?.length || correlatividades?.length) {
          throw new AppError(400, 'Una materia de un espacio no puede definir correlatividades propias; configurá el requisito en Espacios curriculares');
        }
      }
      const existing = await materiaRepository.findByCareerAndName(data.carreraId, nombre, undefined, tx);
      if (existing) {
        throw new AppError(409, 'Ya existe una materia con ese nombre en la carrera');
      }

      const cursoId = await this.resolveCourseId(carrera, data, tx);
      const materia = await materiaRepository.create(
        { ...persistable, nombre, cursoId, aniosRegularidad },
        tx
      );

      if (correlatividades !== undefined) {
        await this.validarCorrelatividadesTipadas(materia.id, materia.carreraId, correlatividades, tx, true);
        await materiaRepository.replaceTypedCorrelatividades(materia.id, correlatividades, tx);
      } else if (correlativasIds !== undefined) {
        const reglas = correlativasIds.map(materiaRequeridaId => ({ materiaRequeridaId, aplicaCursado: false, aplicaRendir: true }));
        await this.validarCorrelatividadesTipadas(materia.id, materia.carreraId, reglas, tx, false);
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

    // Si cambia el tipo de espacio sin cargar años de regularidad,
    // se recalculan automáticamente (valor explícito = prioridad).
    const aniosRegularidad = data.tipoEspacio && data.aniosRegularidad === undefined
      ? this.resolverAniosRegularidad(data.tipoEspacio, null)
      : data.aniosRegularidad;
    if (data.correlativasIds !== undefined && data.correlatividades !== undefined) throw new AppError(400, 'Usá correlativasIds o correlatividades, no ambos campos');
    const { cursoAnio: _cursoAnio, correlativasIds, correlatividades, ...persistable } = data;
    const correlationInputChanged = correlativasIds !== undefined || correlatividades !== undefined;
    const recalcularElegibilidad = data.asistenciaRequerida !== undefined ||
      data.notaMinima !== undefined ||
      data.notaPromocion !== undefined || data.tpRequeridos !== undefined || data.esPromocionable !== undefined;
    const membershipMayChange = data.espacioCurricularId !== undefined || data.activo === false;

    return await materiaRepository.withTransaction(async tx => {
      const carreraObjetivoId = data.carreraId ?? materia.carreraId;
    const bloquearCarrera = recalcularElegibilidad || carreraObjetivoId !== materia.carreraId || membershipMayChange || correlationInputChanged;
      if (bloquearCarrera) {
        for (const idCarrera of [...new Set([materia.carreraId, carreraObjetivoId])].sort((a, b) => a - b)) {
          await lockCareerForAcademicMutation(tx, idCarrera);
        }
        const current = await tx.$queryRaw<Array<{ carreraId: number }>>`SELECT carrera_id AS carreraId FROM materias WHERE id = ${id} FOR UPDATE`;
        if (!current[0]) throw new AppError(404, 'Materia no encontrada');
        if (current[0].carreraId !== materia.carreraId) {
          throw new AppError(409, 'La carrera de la materia cambió durante la operación; volvé a intentar');
        }
      }
      const materiaActual = await materiaRepository.findById(id, tx);
      if (!materiaActual) throw new AppError(404, 'Materia no encontrada');
      const carreraId = data.carreraId ?? materiaActual.carreraId;
      const espacioCurricularId = data.espacioCurricularId !== undefined
        ? data.espacioCurricularId
        : materiaActual.espacioCurricularId;
      const compositionChanged = espacioCurricularId !== materiaActual.espacioCurricularId;
      const existingRules = materiaActual.correlatividadesOrigen ?? [];
      const activeOwnRules = existingRules.filter((rule: any) => !rule.suspendidaPorEspacio);
      if (correlationInputChanged && (materiaActual.espacioCurricularId != null || existingRules.some((rule: any) => rule.suspendidaPorEspacio))) {
        throw new AppError(409, 'Las correlatividades de una materia agrupada se revisan desde Espacios curriculares');
      }
      if (compositionChanged && espacioCurricularId != null && activeOwnRules.length) {
        throw new AppError(409, 'La materia tiene correlatividades propias activas; revisalas desde Espacios curriculares antes de agruparla');
      }
      if (materiaActual.espacioCurricularId != null && carreraId !== materiaActual.carreraId && espacioCurricularId === materiaActual.espacioCurricularId) {
        throw new AppError(400, 'Desvinculá la materia del espacio antes de cambiar su carrera');
      }
      const spacesToLock = new Set<number>();
      if (compositionChanged && materiaActual.espacioCurricularId != null) spacesToLock.add(materiaActual.espacioCurricularId);
      if (compositionChanged && espacioCurricularId != null) spacesToLock.add(espacioCurricularId);
      if (carreraId !== materiaActual.carreraId && materiaActual.espacioCurricularId != null) spacesToLock.add(materiaActual.espacioCurricularId);
      if (data.activo === false && materiaActual.espacioCurricularId != null) spacesToLock.add(materiaActual.espacioCurricularId);
      for (const spaceId of [...spacesToLock].sort((a, b) => a - b)) {
        const expectedCareerId = spaceId === espacioCurricularId ? carreraId : materiaActual.carreraId;
        await this.lockSpaceMembershipForMutation(tx, spaceId, expectedCareerId);
      }
      if (compositionChanged && espacioCurricularId != null) {
        await this.validateMembershipGraph(tx, carreraId, id, espacioCurricularId);
      }
      const carreraActual = bloquearCarrera
        ? await tx.carrera.findUnique({ where: { id: carreraId } })
        : carrera;
      if (!carreraActual) throw new AppError(404, 'Carrera no encontrada');
      const nombre = data.nombre === undefined ? materiaActual.nombre : this.normalizeName(data.nombre);
      if (nombre !== materiaActual.nombre || carreraId !== materiaActual.carreraId) {
        const existing = await materiaRepository.findByCareerAndName(carreraId, nombre, id, tx);
        if (existing) {
          throw new AppError(409, 'Ya existe una materia con ese nombre en la carrera');
        }
      }

      let cursoId = data.cursoId;
      if (data.cursoAnio !== undefined || data.cursoId !== undefined) {
        cursoId = await this.resolveCourseId(carreraActual, data, tx);
      } else if (carreraId !== materiaActual.carreraId && materiaActual.curso?.anio) {
        cursoId = await this.resolveCourseId(carreraActual, { cursoAnio: materiaActual.curso.anio }, tx);
      }

      const incidentes = await materiaRepository.getIncidentCorrelativityEdges(id, tx);
      const salientesFinales = correlativasIds ?? incidentes
        .filter(edge => edge.materiaOrigenId === id)
        .map(edge => edge.materiaRequeridaId);

      // La configuración anterior puede estar completando un espacio aunque
      // la nueva configuración quite esa elegibilidad. Capturamos ese estado
      // bajo el lock antes de mutar y aplicamos el latch después del update.
      const espaciosCompletadosAntes = recalcularElegibilidad
        ? await this.espaciosCompletadosPorCambioDeConfiguracion(tx, materiaActual.carreraId, id)
        : new Set<number>();

      const actualizada = await materiaRepository.update(id, {
        ...persistable,
        ...(aniosRegularidad !== undefined ? { aniosRegularidad } : {}),
        nombre,
        carreraId,
        ...(cursoId !== undefined ? { cursoId } : {})
      }, tx);

      if (compositionChanged && espacioCurricularId != null) {
        await espacioCurricularService.latchIfCompleted(tx, espacioCurricularId);
      }

      if (correlatividades !== undefined) {
        await this.validarCorrelatividadesTipadas(id, carreraId, correlatividades, tx, true);
        await materiaRepository.replaceTypedCorrelatividades(id, correlatividades, tx);
      } else if (correlativasIds !== undefined) {
        await this.validarCorrelatividadesTipadas(id, carreraId, correlativasIds.map(materiaRequeridaId => ({ materiaRequeridaId, aplicaCursado: false, aplicaRendir: true })), tx, false);
        await materiaRepository.replaceCorrelatividades(id, correlativasIds, tx);
      } else {
        await this.validarGrafoFinalMateria(id, carreraId, salientesFinales, tx);
      }
      if (carreraId !== materiaActual.carreraId) await this.validarCarreraCorrelatividadesMateria(id, carreraId, tx);

      if (recalcularElegibilidad) {
        const espaciosCompletados = await this.espaciosCompletadosPorCambioDeConfiguracion(tx, carreraId, id);
        for (const spaceId of espaciosCompletadosAntes) espaciosCompletados.add(spaceId);
        await this.fijarLatchEspacios(tx, espaciosCompletados);
      }

      return await materiaRepository.findById(actualizada.id, tx);
    });
  }

  async deleteMateria(id: number) {
    const materia = await materiaRepository.findById(id);
    if (!materia) {
      throw new Error('Materia no encontrada');
    }
    return materiaRepository.withTransaction(async tx => {
      await lockCareerForAcademicMutation(tx, materia.carreraId);
      const locked = await tx.$queryRaw<Array<{ carreraId: number }>>`SELECT carrera_id AS carreraId FROM materias WHERE id = ${id} FOR UPDATE`;
      if (!locked[0]) throw new AppError(404, 'Materia no encontrada');
      if (locked[0].carreraId !== materia.carreraId) throw new AppError(409, 'La carrera de la materia cambió durante la operación; volvé a intentar');
      const current = await materiaRepository.findById(id, tx);
      if (!current) throw new AppError(404, 'Materia no encontrada');
      if (current.espacioCurricularId != null) {
        await this.lockSpaceMembershipForMutation(tx, current.espacioCurricularId, current.carreraId);
      }
      return tx.materia.update({ where: { id }, data: { activo: false } });
    });
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
    materiaRequeridaId?: number;
    espacioRequeridoId?: number;
    tipoRequisito?: 'OBLIGATORIA';
    aplicaCursado?: boolean;
    aplicaRendir?: boolean;
  }) {
    const origen = await materiaRepository.findById(data.materiaOrigenId);
    if (!origen) {
      throw new Error('Materia origen no encontrada');
    }
    if (origen.activo === false || origen.espacioCurricular?.activo) throw new AppError(409, 'Las correlatividades de una materia componente se configuran en su espacio curricular');
    if (Number.isInteger(data.materiaRequeridaId) === Number.isInteger(data.espacioRequeridoId)) throw new AppError(400, 'Indicá una materia o un espacio curricular como destino');
    const regla: CorrelatividadInput = {
      ...(data.materiaRequeridaId !== undefined ? { materiaRequeridaId: data.materiaRequeridaId } : {}),
      ...(data.espacioRequeridoId !== undefined ? { espacioRequeridoId: data.espacioRequeridoId } : {}),
      aplicaCursado: data.aplicaCursado ?? false,
      aplicaRendir: data.aplicaRendir ?? true
    };
    return await materiaRepository.withTransaction(async tx => {
      await this.validarCorrelatividadesTipadas(data.materiaOrigenId, origen.carreraId, [regla], tx, false);
      const duplicate = await tx.correlatividad.findFirst({ where: {
        materiaOrigenId: data.materiaOrigenId,
        materiaRequeridaId: regla.materiaRequeridaId ?? null,
        espacioRequeridoId: regla.espacioRequeridoId ?? null
      } });
      if (duplicate) throw new AppError(409, 'La correlatividad ya existe');
      return tx.correlatividad.create({ data: {
        materiaOrigenId: data.materiaOrigenId,
        materiaRequeridaId: regla.materiaRequeridaId ?? null,
        espacioRequeridoId: regla.espacioRequeridoId ?? null,
        tipoRequisito: 'OBLIGATORIA',
        aplicaCursado: regla.aplicaCursado,
        aplicaRendir: regla.aplicaRendir
      } });
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
    const estadosPorMateria = await estadoAcademicoService.getMapaEstadosPorMateria(idAlumno);
    const materiasAprobadas = await estadoAcademicoService.getMateriasAprobadasSet(
      idAlumno,
      estadosPorMateria
    );
    const materiasCumplidas = new Set(materiasAprobadas);
    for (const [materiaId, estado] of estadosPorMateria) if (estadoAcademicoService.esRegularizado(estado)) materiasCumplidas.add(materiaId);
    const espacioCurricularIds = [...new Set(
      hechos.materias
        .map(materia => materia.espacioCurricularId)
        .filter((id): id is number => typeof id === 'number')
    )];
    const espaciosPorId = new Map((espacioCurricularIds.length === 0 ? [] : await prisma.espacioCurricular.findMany({
      where: { id: { in: espacioCurricularIds }, activo: true },
      select: { id: true, activo: true, materias: { select: { id: true } } }
    })).map(space => [space.id, space]));
    const espacioIds = [...espaciosPorId.keys()];
    const reglasEspacio = espacioIds.length === 0 ? [] : await prisma.espacioCorrelatividad.findMany({
      where: { espacioOrigenId: { in: espacioIds } },
      include: {
        materiaRequerida: { select: { id: true, nombre: true } },
        espacioRequerido: { select: { id: true, nombre: true, materias: { select: { id: true } } } }
      }
    });
    for (const materia of hechos.materias) {
      const space = materia.espacioCurricularId === null ? null : espaciosPorId.get(materia.espacioCurricularId) ?? null;
      let resultadoCorrelatividades;
      let reglaPorId = new Map<number, RequisitoAcademico>();
      if (space) {
        const reglas: RequisitoAcademico[] = reglasEspacio.filter(rule => rule.espacioOrigenId === space.id && rule.aplicaCursado).flatMap<RequisitoAcademico>(rule => rule.materiaRequerida
            ? [{ tipo: 'MATERIA' as const, requisitoId: rule.id, nombre: rule.materiaRequerida.nombre, materiaId: rule.materiaRequerida.id }]
            : rule.espacioRequerido ? [{ tipo: 'ESPACIO' as const, requisitoId: rule.id, nombre: rule.espacioRequerido.nombre, espacioId: rule.espacioRequerido.id, componentesIds: rule.espacioRequerido.materias.map(component => component.id) }] : []);
        reglaPorId = new Map(reglas.map(regla => [regla.requisitoId, regla]));
        resultadoCorrelatividades = evaluarRequisitosAcademicos({ modo: 'CURSAR', reglas, materiasCumplidas });
      } else {
        const reglas: RequisitoAcademico[] = materia.correlatividadesOrigen
          .filter(rule => !rule.suspendidaPorEspacio && rule.aplicaCursado)
          .flatMap<RequisitoAcademico>(rule => rule.materiaRequerida
            ? [{ tipo: 'MATERIA' as const, requisitoId: rule.id, nombre: rule.materiaRequerida.nombre, materiaId: rule.materiaRequerida.id }]
            : rule.espacioRequerido ? [{ tipo: 'ESPACIO' as const, requisitoId: rule.id, nombre: rule.espacioRequerido.nombre, espacioId: rule.espacioRequerido.id, componentesIds: rule.espacioRequerido.materias.map(component => component.id) }] : []);
        reglaPorId = new Map(reglas.map(regla => [regla.requisitoId, regla]));
        resultadoCorrelatividades = evaluarRequisitosAcademicos({ modo: 'CURSAR', reglas, materiasCumplidas });
      }
      const correlativasPendientes = resultadoCorrelatividades.cumple
        ? []
        : resultadoCorrelatividades.pendientes.map(pendiente => {
            const regla = reglaPorId.get(pendiente.requisitoId);
            return regla?.tipo === 'MATERIA'
              ? { tipo: 'MATERIA' as const, id: regla.materiaId, nombre: pendiente.nombre }
              : { tipo: 'ESPACIO' as const, id: regla?.tipo === 'ESPACIO' ? regla.espacioId : pendiente.requisitoId, nombre: pendiente.nombre };
          });
      const materiaEvaluada: MateriaDisponibleEvaluada = {
        ...materia,
        yaInscripto: hechos.materiasInscriptasIds.includes(materia.id),
        yaAprobada: materiasAprobadas.has(materia.id),
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
    const materiasFinales = Array.from(materiasMap.values()).filter(materia =>
      materia.espacioCurricularId == null || !espaciosPorId.has(materia.espacioCurricularId)
    );
    const { default: periodoInscripcionRepository } = await import('../repositories/periodoInscripcionRepository.js');
    const habilitadas = await periodoInscripcionRepository.materiasHabilitadasEnPeriodoVigente(
      materiasFinales.map(materia => materia.id)
    );
    for (const materia of materiasFinales) materia.habilitada = habilitadas.has(materia.id);

    return materiasFinales;
  }

  async verificarInscripcion(alumnoId: number, materiaId: number, cicloLectivo: number, currentUser?: any) {
    if (currentUser?.rol === ROLES.ALUMNO && cicloLectivo < anioInstitucionalActual()) {
      throw new AppError(409, 'Los ciclos anteriores son de consulta histórica y no admiten autoinscripción');
    }
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

    // Verificar correlatividades
    const materiasDisponibles = await this.getMateriasDisponibles(alumnoId, cicloLectivo);
    const materiaDisponible = materiasDisponibles.find((m: any) => m.id === materiaId);
    
    if (!materiaDisponible) {
      throw new Error('No se puede inscribir a esta materia');
    }

    if (materiaDisponible.yaAprobada) {
      throw new Error('El alumno ya aprobó esta materia');
    }

    if (!materiaDisponible.cumpleCorrelativas) {
      const pendientes = materiaDisponible.correlativasPendientes || [];
      const mensaje = pendientes
        .map(pendiente => `Falta: ${pendiente.nombre}`)
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
