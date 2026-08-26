import cursadaRepository from '../repositories/cursadaRepository.js';
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
