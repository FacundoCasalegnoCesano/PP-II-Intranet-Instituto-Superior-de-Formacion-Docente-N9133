import cursadaRepository from '../repositories/cursadaRepository.js';
import carreraRepository from '../repositories/carreraRepository.js';
import materiaRepository from '../repositories/materiaRepository.js';
import calificacionRepository from '../repositories/calificacionRepository.js';
import asistenciaRepository from '../repositories/asistenciaRepository.js';
import { getAlumnoIdByUsuarioId } from '../utils/alumnoHelper.js';
import { verificarPermisoCursada } from '../utils/docenteHelper.js';
import { AppError } from '../utils/AppError.js';
import { ROLES } from '../constants/roles.js';
import { prisma } from '../config/prisma.js';
import {
  consolidarTrayectoria,
  evaluarCursada,
  esRegularizado,
  type Estado,
  type MateriaSnapshot,
  type TrayectoriaSnapshot
} from '../domain/academico/trayectoriaAcademica.js';
import type { CalificacionSnapshot } from '../domain/academico/calificaciones.js';

type CurrentUser = { id: number; rol: string } | undefined;

type MateriaRecord = {
  id: number;
  nombre: string;
  carreraId: number;
  notaMinima?: number | null;
  notaPromocion?: number | null;
  asistenciaRequerida?: number | null;
  tpRequeridos?: number | null;
  esPromocionable?: boolean | null;
  modalidad?: string | null;
  regimen?: string | null;
  tipoEspacio?: string | null;
  aniosRegularidad?: number | null;
};

type CursadaRecord = {
  id: number;
  materiaId: number;
  anioLectivo: number;
  periodo: string;
  activo: boolean;
  calificaciones?: CalificacionRecord[];
  asistencias?: AsistenciaRecord[];
};

type CalificacionRecord = CalificacionSnapshot;

type AsistenciaRecord = {
  alumnoId: number;
  fecha: Date;
  presente: boolean;
  justificado: boolean;
};

function materiaSnapshot(materia: MateriaRecord): MateriaSnapshot {
  return {
    id: materia.id,
    nombre: materia.nombre,
    carreraId: materia.carreraId,
    notaMinima: materia.notaMinima,
    notaPromocion: materia.notaPromocion,
    asistenciaRequerida: materia.asistenciaRequerida,
    tpRequeridos: materia.tpRequeridos,
    esPromocionable: materia.esPromocionable,
    modalidad: materia.modalidad,
    regimen: materia.regimen,
    tipoEspacio: materia.tipoEspacio,
    aniosRegularidad: materia.aniosRegularidad
  };
}

function snapshot(
  alumnoUsuarioId: number,
  idAlumno: number,
  cursada: CursadaRecord,
  materia: MateriaRecord,
  calificaciones: CalificacionRecord[],
  asistencias: AsistenciaRecord[]
): TrayectoriaSnapshot {
  return {
    alumnoUsuarioId,
    idAlumno,
    cursada: {
      id: cursada.id,
      materiaId: cursada.materiaId,
      anioLectivo: cursada.anioLectivo,
      periodo: cursada.periodo,
      activo: cursada.activo
    },
    materia: materiaSnapshot(materia),
    calificaciones,
    asistencias
  };
}

function calificacionesSnapshot(calificaciones: CalificacionRecord[]): CalificacionSnapshot[] {
  return calificaciones.map(calificacion => ({
    id: calificacion.id,
    alumnoId: calificacion.alumnoId,
    tipoCalificacion: calificacion.tipoCalificacion,
    numero: calificacion.numero,
    nota: calificacion.nota,
    parcialOriginalId: calificacion.parcialOriginalId
  }));
}

function asistenciasSnapshot(asistencias: AsistenciaRecord[]): AsistenciaRecord[] {
  return asistencias.map(asistencia => ({
    alumnoId: asistencia.alumnoId,
    fecha: asistencia.fecha,
    presente: asistencia.presente,
    justificado: asistencia.justificado
  }));
}

class EstadoAcademicoService {
  async getTrayectoriaIntegral(alumnoUsuarioId: number, carreraId: number, currentUser: CurrentUser) {
    if (
      !currentUser ||
      (currentUser.rol !== ROLES.ALUMNO && currentUser.rol !== ROLES.ADMINISTRATIVO) ||
      (currentUser.rol === ROLES.ALUMNO && currentUser.id !== alumnoUsuarioId)
    ) {
      throw new AppError(403, 'Solo puedes consultar tu propia trayectoria académica');
    }

    const carrera = await carreraRepository.getPlanEstudio(carreraId);
    if (!carrera || (currentUser.rol === ROLES.ALUMNO && !carrera.activo)) {
      throw new AppError(404, 'Carrera no encontrada');
    }

    const idAlumno = await getAlumnoIdByUsuarioId(alumnoUsuarioId);
    const [inscripciones, examenes, homologaciones] = await Promise.all([
      prisma.inscripcionMateria.findMany({
        where: { alumnoId: idAlumno, materia: { carreraId }, estado: { not: 'BAJA' } },
        include: {
          materia: { include: { curso: true } },
          cursada: { include: { materia: true, calificaciones: true, asistencias: true } }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.inscripcionExamen.findMany({
        where: {
          alumnoId: idAlumno,
          aprobado: true,
          notaFinal: { not: null },
          fechaBaja: null,
          mesa: { materia: { carreraId } }
        },
        include: { mesa: { include: { materia: true } } },
        orderBy: { updatedAt: 'desc' }
      }),
      prisma.homologacion.findMany({
        where: { alumnoId: idAlumno, estado: 'APROBADA', materia: { carreraId } },
        include: { materia: true },
        orderBy: { updatedAt: 'desc' }
      })
    ]);

    const porMateria = new Map<number, any[]>();
    for (const inscripcion of inscripciones as any[]) {
      const filas = porMateria.get(inscripcion.materiaId) ?? [];
      filas.push(inscripcion);
      porMateria.set(inscripcion.materiaId, filas);
    }
    const examenPorMateria = new Map<number, any>();
    for (const examen of examenes as any[]) {
      if (!examenPorMateria.has(examen.mesa.materiaId)) examenPorMateria.set(examen.mesa.materiaId, examen);
    }
    const homologacionPorMateria = new Map<number, any>();
    for (const homologacion of homologaciones as any[]) {
      if (!homologacionPorMateria.has(homologacion.materiaId)) homologacionPorMateria.set(homologacion.materiaId, homologacion);
    }

    const materias = (carrera.materias ?? []).map((materia: any, indice: number) => {
      const historial = porMateria.get(materia.id) ?? [];
      const cursadas = historial
        .filter((inscripcion: any) => inscripcion.cursada)
        .map((inscripcion: any) => {
          const cursada = inscripcion.cursada;
          const resultado = evaluarCursada(
            snapshot(
              alumnoUsuarioId,
              idAlumno,
              cursada,
              cursada.materia ?? materia,
              calificacionesSnapshot(cursada.calificaciones ?? []),
              asistenciasSnapshot(cursada.asistencias ?? [])
            ),
            new Date()
          );
          return { cursadaId: cursada.id, anioLectivo: cursada.anioLectivo, periodo: cursada.periodo, activo: cursada.activo, ...resultado };
        });
      const ultimaInscripcion = historial[0] ?? null;
      const ultimoResultado = cursadas[0] ?? null;
      const examenFinal = examenPorMateria.get(materia.id) ?? null;
      const homologacion = homologacionPorMateria.get(materia.id) ?? null;
      const promocion = cursadas.find((cursada: any) => cursada.estado === 'PROMOCIONADO') ?? null;

      let estado = ultimoResultado?.estado ?? 'PENDIENTE';
      let definitiva: any = null;
      if (examenFinal) {
        estado = 'APROBADA';
        definitiva = { via: 'EXAMEN_FINAL', nota: examenFinal.notaFinal, fecha: examenFinal.mesa?.fecha ?? examenFinal.updatedAt };
      } else if (homologacion) {
        estado = 'HOMOLOGADA';
        definitiva = { via: 'HOMOLOGACION', nota: homologacion.calificacion, fecha: homologacion.fechaHomologacion };
      } else if (promocion) {
        estado = 'PROMOCIONADO';
        definitiva = { via: 'PROMOCION_DIRECTA', nota: promocion.examenFinalNota, fecha: null };
      }

      return {
        materia: { id: materia.id, nombre: materia.nombre },
        plan: { cursoId: materia.cursoId ?? null, anio: materia.curso?.anio ?? null, posicion: indice + 1 },
        estado,
        inscripcion: ultimaInscripcion ? {
          id: ultimaInscripcion.id,
          cicloLectivo: ultimaInscripcion.cicloLectivo,
          modalidad: ultimaInscripcion.modalidadElegida,
          estado: ultimaInscripcion.estado,
          fechaInscripcion: ultimaInscripcion.fechaInscripcion,
          fechaBaja: ultimaInscripcion.fechaBaja
        } : null,
        cursadas,
        asistencia: ultimoResultado?.asistencia ?? null,
        tps: ultimoResultado?.tps ?? null,
        parcialesEfectivos: ultimoResultado?.parcialesEfectivos ?? [],
        regularidad: ultimoResultado ? { hasta: ultimoResultado.regularHasta, vencida: ultimoResultado.regularidadVencida } : null,
        promocionDirecta: promocion ? { habilitada: true, nota: promocion.examenFinalNota } : null,
        examenFinal: examenFinal ? { mesaId: examenFinal.mesaId, nota: examenFinal.notaFinal, aprobado: examenFinal.aprobado, fecha: examenFinal.mesa?.fecha ?? examenFinal.updatedAt } : null,
        homologacion: homologacion ? { id: homologacion.id, nota: homologacion.calificacion, tipo: homologacion.tipoHomologacion, fecha: homologacion.fechaHomologacion } : null,
        definitiva
      };
    });

    const notasDefinitivas = materias
      .map((materia: any) => materia.definitiva?.nota)
      .filter((nota: unknown): nota is number => typeof nota === 'number');
    const promedioGeneral = notasDefinitivas.length > 0
      ? Number((notasDefinitivas.reduce((total: number, nota: number) => total + nota, 0) / notasDefinitivas.length).toFixed(2))
      : null;

    return {
      alumnoUsuarioId,
      carrera: { id: carrera.id, nombre: carrera.nombre, duracionAnios: carrera.duracionAnios },
      promedioGeneral,
      cantidadMateriasAprobadas: notasDefinitivas.length,
      materias
    };
  }

  async getResumenPorMateria(materiaId: number, currentUser: CurrentUser, cicloLectivo?: number) {
    const ciclo = cicloLectivo ?? new Date().getFullYear();
    const cursada = await cursadaRepository.getCursadaActivaByMateria(materiaId, ciclo);
    if (!cursada) {
      throw new AppError(404, `No hay cursada activa para esta materia en ${ciclo}`);
    }

    await verificarPermisoCursada(currentUser, cursada.id);
    const materia = await materiaRepository.findById(materiaId);
    const [inscriptos, calificaciones, asistencias] = await Promise.all([
      calificacionRepository.getInscriptosActivosByCursada(cursada.id),
      calificacionRepository.findAllByCursadaSimple(cursada.id),
      asistenciaRepository.findAllByCursadaSimple(cursada.id)
    ]);

    const filas = inscriptos.map(inscripcion =>
      evaluarCursada(
        snapshot(
          inscripcion.alumno.idCuenta,
          inscripcion.alumnoId,
          cursada,
          materia,
          calificacionesSnapshot(calificaciones),
          asistenciasSnapshot(asistencias)
        ),
        new Date()
      )
    );

    return {
      materia: { id: materia.id, nombre: materia.nombre },
      cursadaId: cursada.id,
      anioLectivo: cursada.anioLectivo,
      periodo: cursada.periodo,
      alumnos: filas
    };
  }

  async getEstadoAlumno(alumnoUsuarioId: number, currentUser: CurrentUser) {
    if (currentUser?.rol === ROLES.PROFESOR) {
      throw new AppError(403, 'Los profesores deben consultar el estado desde sus materias');
    }
    if (currentUser!.rol === ROLES.ALUMNO && currentUser!.id !== alumnoUsuarioId) {
      throw new AppError(403, 'Solo puedes consultar tu propio estado académico');
    }

    const idAlumno = await getAlumnoIdByUsuarioId(alumnoUsuarioId);
    const inscripciones = await prisma.inscripcionMateria.findMany({
      where: { alumnoId: idAlumno, estado: { not: 'BAJA' } },
      include: {
        cursada: {
          include: { materia: true, calificaciones: true, asistencias: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const materias = [];
    for (const inscripcion of inscripciones) {
      if (!inscripcion.cursada || !inscripcion.cursada.activo) continue;
      const cursada = inscripcion.cursada;
      const fila = evaluarCursada(
        snapshot(
          alumnoUsuarioId,
          idAlumno,
          cursada,
          cursada.materia,
          calificacionesSnapshot(cursada.calificaciones),
          asistenciasSnapshot(cursada.asistencias)
        ),
        new Date()
      );
      materias.push({
        materia: { id: cursada.materia.id, nombre: cursada.materia.nombre },
        cicloLectivo: inscripcion.cicloLectivo,
        modalidadElegida: inscripcion.modalidadElegida,
        ...fila
      });
    }

    return { alumnoUsuarioId, materias };
  }

  async tieneRegularidadVigente(idAlumno: number, materiaId: number): Promise<boolean> {
    const regulares = await this.getRegularidadesVigentesSet(
      idAlumno,
      [materiaId],
      new Date()
    );
    return regulares.has(materiaId);
  }

  async getRegularidadesVigentesSet(
    idAlumno: number,
    materiaIds: number[],
    evaluadoEn: Date
  ): Promise<Set<number>> {
    if (materiaIds.length === 0) return new Set();

    const inscripciones = await prisma.inscripcionMateria.findMany({
      where: {
        alumnoId: idAlumno,
        materiaId: { in: [...new Set(materiaIds)] },
        estado: { not: 'BAJA' }
      },
      include: {
        materia: true,
        cursada: { include: { calificaciones: true, asistencias: true } }
      },
      orderBy: { cicloLectivo: 'desc' }
    });

    const regulares = new Set<number>();
    for (const inscripcion of inscripciones) {
      if (!inscripcion.cursada) continue;
      const cursada = inscripcion.cursada;
      const materia = inscripcion.materia;
      const fila = evaluarCursada(
        snapshot(
          idAlumno,
          idAlumno,
          cursada,
          materia,
          calificacionesSnapshot(cursada.calificaciones),
          asistenciasSnapshot(cursada.asistencias)
        ),
        evaluadoEn
      );
      if (fila.estado === 'REGULAR' || fila.estado === 'HABILITADO_PROMOCION') {
        regulares.add(materia.id);
      }
    }
    return regulares;
  }

  async getMapaEstadosPorMateria(idAlumno: number): Promise<Map<number, Estado>> {
    const inscripciones = await prisma.inscripcionMateria.findMany({
      where: { alumnoId: idAlumno, estado: { not: 'BAJA' } },
      include: {
        cursada: {
          include: { materia: true, calificaciones: true, asistencias: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const evaluaciones: Array<{ materiaId: number; estado: Estado }> = [];
    for (const inscripcion of inscripciones) {
      if (!inscripcion.cursada || !inscripcion.cursada.activo) continue;
      const cursada = inscripcion.cursada;
      const fila = evaluarCursada(
        snapshot(
          idAlumno,
          inscripcion.alumnoId,
          cursada,
          cursada.materia,
          calificacionesSnapshot(cursada.calificaciones),
          asistenciasSnapshot(cursada.asistencias)
        ),
        new Date()
      );
      evaluaciones.push({ materiaId: cursada.materia.id, estado: fila.estado });
    }
    return consolidarTrayectoria({ evaluaciones });
  }

  async getMateriasAprobadasSet(
    idAlumno: number,
    mapaExistente?: Map<number, Estado>
  ): Promise<Set<number>> {
    const aprobadas = new Set<number>();
    const examenes = await prisma.inscripcionExamen.findMany({
      where: { alumnoId: idAlumno, aprobado: true },
      include: { mesa: { select: { materiaId: true } } }
    });
    for (const examen of examenes) aprobadas.add(examen.mesa.materiaId);

    const homologaciones = await prisma.homologacion.findMany({
      where: { alumnoId: idAlumno, estado: 'APROBADA' },
      select: { materiaId: true }
    });
    for (const homologacion of homologaciones) aprobadas.add(homologacion.materiaId);

    const mapa = mapaExistente ?? await this.getMapaEstadosPorMateria(idAlumno);
    for (const [materiaId, estado] of mapa) {
      if (estado === 'PROMOCIONADO') aprobadas.add(materiaId);
    }
    return aprobadas;
  }

  private agregarDefinitiva(
    definitivas: Map<number, { materiaId: number; carreraId: number; nombre: string; nota: number; via: 'EXAMEN_FINAL' | 'HOMOLOGACION' | 'PROMOCION_DIRECTA' }>,
    definitiva: { materiaId: number; carreraId: number; nombre: string; nota: number; via: 'EXAMEN_FINAL' | 'HOMOLOGACION' | 'PROMOCION_DIRECTA' }
  ) {
    if (!definitivas.has(definitiva.materiaId)) definitivas.set(definitiva.materiaId, definitiva);
  }

  async getPromedioGeneral(
    alumnoUsuarioId: number,
    currentUser: CurrentUser,
    carreraId?: number
  ) {
    if (currentUser?.rol === ROLES.PROFESOR) {
      throw new AppError(403, 'Los profesores no pueden consultar promedios globales');
    }
    if (currentUser!.rol === ROLES.ALUMNO && currentUser!.id !== alumnoUsuarioId) {
      throw new AppError(403, 'Solo puedes consultar tu propio promedio');
    }

    const idAlumno = await getAlumnoIdByUsuarioId(alumnoUsuarioId);
    type Definitiva = {
      materiaId: number;
      carreraId: number;
      nombre: string;
      nota: number;
      via: 'EXAMEN_FINAL' | 'HOMOLOGACION' | 'PROMOCION_DIRECTA';
    };
    const definitivas = new Map<number, Definitiva>();

    const examenes = await prisma.inscripcionExamen.findMany({
      where: { alumnoId: idAlumno, aprobado: true, notaFinal: { not: null } },
      include: { mesa: { include: { materia: { select: { id: true, nombre: true, carreraId: true } } } } },
      orderBy: { updatedAt: 'desc' }
    });
    for (const examen of examenes) {
      const materia = examen.mesa.materia;
      if (examen.notaFinal !== null) {
        this.agregarDefinitiva(definitivas, {
          materiaId: materia.id,
          carreraId: materia.carreraId,
          nombre: materia.nombre,
          nota: examen.notaFinal,
          via: 'EXAMEN_FINAL'
        });
      }
    }

    const homologaciones = await prisma.homologacion.findMany({
      where: { alumnoId: idAlumno, estado: 'APROBADA' },
      include: { materia: { select: { id: true, nombre: true, carreraId: true } } }
    });
    for (const homologacion of homologaciones) {
      const materia = homologacion.materia;
      this.agregarDefinitiva(definitivas, {
        materiaId: materia.id,
        carreraId: materia.carreraId,
        nombre: materia.nombre,
        nota: homologacion.calificacion,
        via: 'HOMOLOGACION'
      });
    }

    const inscripciones = await prisma.inscripcionMateria.findMany({
      where: { alumnoId: idAlumno, estado: { not: 'BAJA' } },
      include: {
        cursada: {
          include: { materia: true, calificaciones: true, asistencias: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    for (const inscripcion of inscripciones) {
      if (!inscripcion.cursada || !inscripcion.cursada.activo) continue;
      if (definitivas.has(inscripcion.cursada.materiaId)) continue;
      const cursada = inscripcion.cursada;
      const fila = evaluarCursada(
        snapshot(
          alumnoUsuarioId,
          idAlumno,
          cursada,
          cursada.materia,
          calificacionesSnapshot(cursada.calificaciones),
          asistenciasSnapshot(cursada.asistencias)
        ),
        new Date()
      );
      if (fila.estado === 'PROMOCIONADO' && fila.examenFinalNota !== null) {
        this.agregarDefinitiva(definitivas, {
          materiaId: cursada.materia.id,
          carreraId: cursada.materia.carreraId,
          nombre: cursada.materia.nombre,
          nota: fila.examenFinalNota,
          via: 'PROMOCION_DIRECTA'
        });
      }
    }

    let materiasFinales = Array.from(definitivas.values());
    if (carreraId) materiasFinales = materiasFinales.filter(materia => materia.carreraId === carreraId);
    const cantidad = materiasFinales.length;
    const promedioGeneral =
      cantidad > 0
        ? Number((materiasFinales.reduce((acc, materia) => acc + materia.nota, 0) / cantidad).toFixed(2))
        : null;

    return {
      alumnoUsuarioId,
      ...(carreraId ? { carreraId } : {}),
      promedioGeneral,
      cantidadMateriasAprobadas: cantidad,
      materias: materiasFinales.map(({ materiaId, nombre, nota, via }) => ({ materiaId, nombre, nota, via }))
    };
  }

  esRegularizado(estado: Estado | undefined): boolean {
    return esRegularizado(estado);
  }
}

export default new EstadoAcademicoService();
