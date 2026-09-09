import asistenciaRepository from '../repositories/asistenciaRepository.js';
import cursadaRepository from '../repositories/cursadaRepository.js';
import materiaRepository from '../repositories/materiaRepository.js';
import { getAlumnoIdByUsuarioId } from '../utils/alumnoHelper.js';
import { AppError } from '../utils/AppError.js';
import { ROLES } from '../constants/roles.js';
import { MINIMO_CON_JUSTIFICACION, umbralAsistencia, permiteFlexionJustificadas } from '../utils/reglasAcademicas.js';
import {
  verificarPermisoCursada as verificarPermisoCursadaDocente,
  verificarPermisoMutacionCursada
} from '../utils/docenteHelper.js';
import { fechaPerteneceAlAnioLectivo } from '../utils/cicloLectivo.js';

interface FilaCarga {
  alumnoId: number; // id de cuenta (Usuario.idUsuario)
  presente: boolean;
  justificado?: boolean;
  observacion?: string | null;
}

class AsistenciaService {
  /**
   * Admin siempre puede. Profesor si es docente de la cursada
   * o está asignado a la materia (profesores_materias).
   */
  private async verificarPermisoCursada(currentUser: any, cursadaId: number): Promise<void> {
    await verificarPermisoCursadaDocente(currentUser, cursadaId);
  }

  async cargarClase(
    data: { cursadaId: number; fecha: string | Date; asistencias: FilaCarga[] },
    currentUser: any
  ) {
    await verificarPermisoMutacionCursada(currentUser, data.cursadaId);

    const fechaNormalizada = new Date(new Date(data.fecha).toISOString().slice(0, 10));
    const cursada = await cursadaRepository.findById(data.cursadaId);
    if (!cursada) throw new AppError(404, 'Cursada no encontrada');
    if (!fechaPerteneceAlAnioLectivo(fechaNormalizada, cursada.anioLectivo)) {
      throw new AppError(400, 'La fecha debe pertenecer al año lectivo de la cursada');
    }

    // Resolver id de cuenta → idAlumno y validar que esté inscripto a la cursada
    const filasConIdAlumno = [];
    for (const fila of data.asistencias) {
      const idAlumno = await getAlumnoIdByUsuarioId(fila.alumnoId);

      const inscripto = await asistenciaRepository.isAlumnoInscripto(data.cursadaId, idAlumno);
      if (!inscripto) {
        throw new AppError(
          400,
          `El alumno ${fila.alumnoId} no está inscripto a esta cursada`
        );
      }

      filasConIdAlumno.push({
        idAlumno,
        presente: fila.presente,
        justificado: fila.justificado ?? false,
        observacion: fila.observacion ?? null
      });
    }
    const resultado = await asistenciaRepository.upsertClase(
      data.cursadaId,
      fechaNormalizada,
      filasConIdAlumno
    );

    return { registros: resultado.length, fecha: fechaNormalizada };
  }

  async getByCursada(cursadaId: number, fecha: string | Date | undefined, currentUser: any) {
    await this.verificarPermisoCursada(currentUser, cursadaId);

    const fechaNormalizada = fecha
      ? new Date(new Date(fecha).toISOString().slice(0, 10))
      : undefined;

    return await asistenciaRepository.findByCursada(cursadaId, fechaNormalizada);
  }

  async getByAlumno(alumnoUsuarioId: number, currentUser: any) {
    if (currentUser.rol === ROLES.PROFESOR) {
      throw new AppError(403, 'Los profesores deben consultar asistencia desde sus cursadas');
    }
    // El alumno solo puede ver su propio historial
    if (
      currentUser.rol === ROLES.ALUMNO &&
      currentUser.id !== alumnoUsuarioId
    ) {
      throw new AppError(403, 'Solo puedes consultar tu propia asistencia');
    }

    const idAlumno = await getAlumnoIdByUsuarioId(alumnoUsuarioId);
    return await asistenciaRepository.findByAlumno(idAlumno);
  }

  /**
   * Resumen por alumno de una cursada (Art. 28 RAI):
   * % = presentes / totalClases (estricto: las justificadas son ausencias).
   * Regularidad: >= asistenciaRequerida (75%), o >= 50% cuando TODAS las
   * ausencias están justificadas.
   */
  async getResumenCursada(cursadaId: number, currentUser: any) {
    await this.verificarPermisoCursada(currentUser, cursadaId);

    const cursada = (await cursadaRepository.findById(cursadaId))!;
    const materia = (await materiaRepository.findById(cursada.materiaId))!;

    const [registros, inscriptos] = await Promise.all([
      asistenciaRepository.findAllByCursadaSimple(cursadaId),
      asistenciaRepository.getInscriptosActivosByCursada(cursadaId)
    ]);

    // Fechas distintas con registros = clases tomadas
    const fechasSet = new Set(registros.map(r => r.fecha.toISOString().slice(0, 10)));
    const totalClases = fechasSet.size;
    const umbral = umbralAsistencia(materia);

    const porAlumno = inscriptos.map(({ alumnoId }: { alumnoId: number }) => {
      const delAlumno = registros.filter(r => r.alumnoId === alumnoId);
      const presentes = delAlumno.filter(a => a.presente).length;
      const justificados = delAlumno.filter(a => !a.presente && a.justificado).length;
      const injustificados = delAlumno.filter(a => !a.presente && !a.justificado).length;
      const registrados = presentes + justificados + injustificados;

      // Art. 28 RAI: % estricto (las justificadas también son ausencias)
      const porcentaje =
        totalClases > 0 && registrados > 0
          ? Number(((presentes / totalClases) * 100).toFixed(2))
          : null;

      // Regularidad (Art. 28): >= umbral, o flexión al 50% si TODAS las
      // ausencias están justificadas — excepto Talleres de Práctica
      const todasAusenciasJustificadas = injustificados === 0;
      const flexAplica = permiteFlexionJustificadas(materia);
      const cumple =
        porcentaje === null
          ? null
          : porcentaje >= umbral ||
            (flexAplica && porcentaje >= MINIMO_CON_JUSTIFICACION && todasAusenciasJustificadas);

      return {
        alumnoId,
        totalClases,
        presentes,
        ausentesJustificados: justificados,
        ausentesInjustificados: injustificados,
        porcentajeAsistencia: porcentaje,
        requerido: umbral,
        minimoConTodasJustificadas: MINIMO_CON_JUSTIFICACION,
        todasAusenciasJustificadas,
        cumple
      };
    });

    return {
      cursadaId,
      materia: { id: materia.id, nombre: materia.nombre },
      anioLectivo: cursada.anioLectivo,
      totalClasesTomadas: totalClases,
      alumnos: porAlumno
    };
  }
}

export default new AsistenciaService();
