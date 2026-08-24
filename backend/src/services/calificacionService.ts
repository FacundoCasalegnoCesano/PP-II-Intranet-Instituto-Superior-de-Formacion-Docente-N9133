import calificacionRepository from '../repositories/calificacionRepository.js';
import cursadaRepository from '../repositories/cursadaRepository.js';
import materiaRepository from '../repositories/materiaRepository.js';
import { getAlumnoIdByUsuarioId } from '../utils/alumnoHelper.js';
import { verificarPermisoCursada } from '../utils/docenteHelper.js';
import { AppError } from '../utils/AppError.js';
import { ROLES } from '../constants/roles.js';
import { umbralTpsRegularizar } from '../utils/reglasAcademicas.js';
import type { TipoCalificacion } from '@prisma/client';

interface FilaCarga {
  alumnoId: number; // id de cuenta (Usuario.idUsuario)
  tipoCalificacion: TipoCalificacion;
  numero?: number;
  nota: number;
  observacion?: string | null;
}

class CalificacionService {
  async cargarLote(
    data: { cursadaId: number; calificaciones: FilaCarga[] },
    currentUser: any
  ) {
    await verificarPermisoCursada(currentUser, data.cursadaId);

    const filasConIdAlumno = [];
    for (const fila of data.calificaciones) {
      const idAlumno = await getAlumnoIdByUsuarioId(fila.alumnoId);

      const inscripto = await calificacionRepository.isAlumnoInscripto(data.cursadaId, idAlumno);
      if (!inscripto) {
        throw new AppError(400, `El alumno ${fila.alumnoId} no está inscripto a esta cursada`);
      }

      // RECUPERATORIO requiere justificación (observacion) por ausencia justificada
      if (fila.tipoCalificacion === 'RECUPERATORIO' && (!fila.observacion || fila.observacion.trim() === '')) {
        throw new AppError(400, `El RECUPERATORIO N°${fila.numero ?? 1} del alumno ${fila.alumnoId} requiere justificación (observación obligatoria)`);
      }

      filasConIdAlumno.push({
        idAlumno,
        tipoCalificacion: fila.tipoCalificacion,
        numero: fila.numero ?? 1,
        nota: fila.nota,
        observacion: fila.observacion ?? null
      });
    }

    // Validar que la misma combinación alumno+tipo+numero no venga duplicada en el lote
    const vistos = new Set<string>();
    for (const fila of filasConIdAlumno) {
      const clave = `${fila.idAlumno}-${fila.tipoCalificacion}-${fila.numero}`;
      if (vistos.has(clave)) {
        throw new AppError(
          400,
          `Registro duplicado en el lote: alumno ${fila.idAlumno}, tipo ${fila.tipoCalificacion} N°${fila.numero}`
        );
      }
      vistos.add(clave);
    }
    const resultado = await calificacionRepository.upsertLote(data.cursadaId, filasConIdAlumno);

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

    return await calificacionRepository.findByCursada(
      cursadaId,
      filtros.tipo as TipoCalificacion | undefined,
      idAlumnoFiltro
    );
  }

  async getByAlumno(alumnoUsuarioId: number, currentUser: any) {
    if (currentUser.rol === ROLES.ALUMNO && currentUser.id !== alumnoUsuarioId) {
      throw new AppError(403, 'Solo puedes consultar tus propias calificaciones');
    }

    const idAlumno = await getAlumnoIdByUsuarioId(alumnoUsuarioId);
    return await calificacionRepository.findByAlumno(idAlumno);
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

      // Notas efectivas por instancia de parcial:
      // si existe RECUPERATORIO N, reemplaza al PARCIAL N
      const parciales = delAlumno.filter(r => r.tipoCalificacion === 'PARCIAL');
      const recuperatorios = new Map(
        delAlumno
          .filter(r => r.tipoCalificacion === 'RECUPERATORIO')
          .map(r => [r.numero, r.nota])
      );

      const parcialesEfectivos = parciales.map(p => ({
        numero: p.numero,
        notaOriginal: p.nota,
        notaEfectiva: recuperatorios.get(p.numero) ?? p.nota,
        recuperado: recuperatorios.has(p.numero)
      }));

      // Promedio SOLO con notas efectivas de parciales (los TPs no promedian)
      const notasParaPromedio = parcialesEfectivos.map(p => p.notaEfectiva);
      const promedio =
        notasParaPromedio.length > 0
          ? Number((notasParaPromedio.reduce((a, b) => a + b, 0) / notasParaPromedio.length).toFixed(2))
          : null;

      // TPs: condición habilitante (% de aprobados >= tpRequeridos)
      const tpNotas = delAlumno
        .filter(r => r.tipoCalificacion === 'TRABAJO_PRACTICO');
      const tpsAprobados = tpNotas.filter(t => t.nota >= notaMinima).length;
      const porcentajeTps =
        tpNotas.length > 0 ? Number(((tpsAprobados / tpNotas.length) * 100).toFixed(2)) : null;
      const cumpleTps =
        porcentajeTps === null ? null : porcentajeTps >= tpRequeridos;

      return {
        alumnoId,
        notasPorTipo,
        parcialesEfectivos,
        promedio,
        cumpleNotaMinima:
          promedio === null ? null : promedio >= notaMinima && parcialesEfectivos.every(p => p.notaEfectiva >= notaMinima),
        tps: {
          cargados: tpNotas.length,
          aprobados: tpsAprobados,
          porcentaje: porcentajeTps,
          requerido: tpRequeridos,
          cumple: cumpleTps
        },
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
