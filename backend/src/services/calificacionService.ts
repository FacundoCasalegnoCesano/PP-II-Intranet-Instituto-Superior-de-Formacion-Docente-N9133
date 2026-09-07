import calificacionRepository from '../repositories/calificacionRepository.js';
import alumnoRepository from '../repositories/alumnoRepository.js';
import cursadaRepository from '../repositories/cursadaRepository.js';
import materiaRepository from '../repositories/materiaRepository.js';
import { getAlumnoIdByUsuarioId } from '../utils/alumnoHelper.js';
import { verificarPermisoCursada } from '../utils/docenteHelper.js';
import { AppError } from '../utils/AppError.js';
import { ROLES } from '../constants/roles.js';
import { umbralTpsRegularizar } from '../utils/reglasAcademicas.js';
import {
  prepararCargaCalificaciones,
  resumirCalificaciones,
  type FilaCargaCalificaciones
} from '../domain/academico/calificaciones.js';
import type { TipoCalificacion } from '@prisma/client';

type FilaCarga = FilaCargaCalificaciones;

function formatearFechaCalendario(fecha: Date): string {
  const dia = String(fecha.getUTCDate()).padStart(2, '0');
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${fecha.getUTCFullYear()}`;
}

function presentarFechaEvaluacion<
  T extends { tipoCalificacion: string; fechaEvaluacion: Date | null }
>(registro: T) {
  if (
    registro.fechaEvaluacion !== null &&
    (registro.tipoCalificacion === 'PARCIAL' || registro.tipoCalificacion === 'RECUPERATORIO')
  ) {
    return {
      ...registro,
      fechaEvaluacion: formatearFechaCalendario(registro.fechaEvaluacion)
    };
  }

  return registro;
}

class CalificacionService {
  async getCursadasDisponibles(anioLectivo: number, currentUser: any) {
    if (currentUser.rol === ROLES.ADMINISTRATIVO) {
      return await cursadaRepository.findDisponiblesParaCalificaciones({ anioLectivo });
    }

    if (currentUser.rol === ROLES.PROFESOR) {
      return await cursadaRepository.findDisponiblesParaCalificaciones({
        anioLectivo,
        profesorId: currentUser.id
      });
    }

    throw new AppError(403, 'No tienes permisos para consultar cursadas de calificaciones');
  }

  async cargarLote(
    data: { cursadaId: number; calificaciones: FilaCarga[] },
    currentUser: any
  ) {
    await verificarPermisoCursada(currentUser, data.cursadaId);

    const idsUsuario = [...new Set(data.calificaciones.map(fila => fila.alumnoId))];
    const alumnos = await alumnoRepository.findByUsuarioIds(idsUsuario);
    const alumnosPorUsuarioId = new Map(alumnos.map(alumno => [alumno.idCuenta, alumno.idAlumno]));
    const idsAlumno = [...new Set(alumnos.map(alumno => alumno.idAlumno))];
    const inscripciones = idsAlumno.length > 0
      ? await calificacionRepository.findInscripcionesByCursada(data.cursadaId, idsAlumno)
      : [];
    const inscripcionesSet = new Set(inscripciones.map(inscripcion => inscripcion.alumnoId));

    const idsParciales = [...new Set(
      data.calificaciones
        .filter(fila => fila.tipoCalificacion === 'RECUPERATORIO' && fila.parcialOriginalId)
        .map(fila => fila.parcialOriginalId!)
    )];
    const parciales = idsParciales.length > 0
      ? await calificacionRepository.findParcialesByIds(idsParciales)
      : [];
    const parcialesPorId = new Map(parciales.map(parcial => [parcial.id, parcial]));

    const preparacion = prepararCargaCalificaciones(data, {
      alumnosPorUsuarioId,
      inscripciones: inscripcionesSet,
      parcialesPorId
    });
    if (!preparacion.ok) {
      const error = preparacion.error;
      if (error.tipo === 'ALUMNO_NO_ASOCIADO') {
        throw new Error('El usuario no tiene un registro de alumno asociado');
      }
      if (error.tipo === 'ALUMNO_NO_INSCRIPTO') {
        throw new AppError(400, `El alumno ${error.idUsuario} no está inscripto a esta cursada`);
      }
      if (error.tipo === 'FECHA_PARCIAL_REQUERIDA') {
        throw new AppError(400, 'La fecha de evaluacion es requerida para un PARCIAL');
      }
      if (error.tipo === 'PARCIAL_ORIGINAL_REQUERIDO') {
        throw new AppError(400, 'El parcial original es requerido para un RECUPERATORIO');
      }
      if (error.tipo === 'PARCIAL_NO_CORRESPONDE') {
        throw new AppError(400, 'El parcial seleccionado no corresponde al alumno y cursada');
      }
      throw new AppError(
        400,
        `Registro duplicado en el lote: alumno ${error.idAlumno}, tipo ${error.tipoCalificacion} N°${error.numero}`
      );
    }

    const resultado = await calificacionRepository.upsertLote(data.cursadaId, preparacion.filas);

    return { registros: resultado.length };
  }

  async getByCursada(
    cursadaId: number,
    filtros: { tipo?: string; alumnoId?: number },
    currentUser: any
  ) {
    await verificarPermisoCursada(currentUser, cursadaId);

    let idAlumnoFiltro: number | undefined;
    if (filtros.alumnoId) {
      idAlumnoFiltro = await getAlumnoIdByUsuarioId(filtros.alumnoId);
    }

    const registros = await calificacionRepository.findByCursada(
      cursadaId,
      filtros.tipo as TipoCalificacion | undefined,
      idAlumnoFiltro
    );
    return registros.map(presentarFechaEvaluacion);
  }

  async getByAlumno(alumnoUsuarioId: number, currentUser: any) {
    if (currentUser.rol === ROLES.ALUMNO && currentUser.id !== alumnoUsuarioId) {
      throw new AppError(403, 'Solo puedes consultar tus propias calificaciones');
    }

    const idAlumno = await getAlumnoIdByUsuarioId(alumnoUsuarioId);
    const registros = await calificacionRepository.findByAlumno(idAlumno);
    return registros.map(presentarFechaEvaluacion);
  }

  /**
   * Resumen por alumno de una cursada.
   *
   * Reglas institucionales:
   * - El RECUPERATORIO reemplaza la nota del PARCIAL (nota efectiva).
   * - Los TRABAJOS_PRÁCTICOS no promedian: son una condición habilitante
   *   (materia.tpRequeridos = % de TPs aprobados necesarios).
   * - El promedio se calcula SOLO con parciales efectivos.
   */
  async getResumenCursada(cursadaId: number, currentUser: any) {
    await verificarPermisoCursada(currentUser, cursadaId);

    const cursada = (await cursadaRepository.findById(cursadaId))!;
    const materia = (await materiaRepository.findById(cursada.materiaId))!;

    const [registros, inscriptos] = await Promise.all([
      calificacionRepository.findAllByCursadaSimple(cursadaId),
      calificacionRepository.getInscriptosActivosByCursada(cursadaId)
    ]);

    const notaMinima = materia.notaMinima ?? 6;
    const tpRequeridos = umbralTpsRegularizar(materia);

    const porAlumno = inscriptos.map(({ alumnoId }: { alumnoId: number }) => {
      const delAlumno = registros.filter(r => r.alumnoId === alumnoId);

      const notasPorTipo: Record<string, number> = {};
      for (const r of delAlumno) {
        const etiqueta =
          r.tipoCalificacion === 'PARCIAL' || r.tipoCalificacion === 'RECUPERATORIO'
            ? `${r.tipoCalificacion} ${r.numero}`
            : r.tipoCalificacion === 'TRABAJO_PRACTICO'
              ? `TP ${r.numero}`
              : r.tipoCalificacion;
        notasPorTipo[etiqueta] = r.nota;
      }

      // La relación explícita identifica qué parcial reemplaza cada recuperatorio.
      const resumen = resumirCalificaciones({
        calificaciones: delAlumno,
        notaMinima,
        tpRequeridos
      });

      // Promedio SOLO con notas efectivas de parciales (los TPs no promedian)

      // TPs: condición habilitante (% de aprobados >= tpRequeridos)

      return {
        alumnoId,
        notasPorTipo,
        parcialesEfectivos: resumen.parcialesEfectivos,
        promedio: resumen.promedio,
        cumpleNotaMinima: resumen.cumpleNotaMinima,
        tps: resumen.tps,
        notaMinima
      };
    });

    return {
      cursadaId,
      materia: { id: materia.id, nombre: materia.nombre },
      anioLectivo: cursada.anioLectivo,
      alumnos: porAlumno
    };
  }
}

export default new CalificacionService();
