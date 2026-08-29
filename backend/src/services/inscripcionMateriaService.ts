import inscripcionMateriaRepository from '../repositories/inscripcionMateriaRepository.js';
import cursadaRepository from '../repositories/cursadaRepository.js';
import userRepository from '../repositories/userRepository.js';
import materiaRepository from '../repositories/materiaRepository.js';
import periodoInscripcionService from './periodoInscripcionService.js';
import type { InscripcionMateriaCreateData } from '../repositories/inscripcionMateriaRepository.js';
import { ROLES } from '../constants/roles.js';
import { getAlumnoIdByUsuarioId } from '../utils/alumnoHelper.js';
import { AppError } from '../utils/AppError.js';
import estadoAcademicoService from './estadoAcademicoService.js';
import { evaluarCorrelatividades } from '../domain/academico/correlatividades.js';
import { verificarPermisoMateria } from '../utils/docenteHelper.js';

class InscripcionMateriaService {
  async inscribirAlumno(data: InscripcionMateriaCreateData, currentUser: any) {
    // `data.alumnoId` es el id de cuenta (Usuario.idUsuario)
    const alumno = await userRepository.findById(data.alumnoId);
    if (!alumno) {
      throw new Error('Alumno no encontrado');
    }

    const rolesAlumno = (alumno.rol ?? '').split(',').map((rol: string) => rol.trim());
    if (!rolesAlumno.includes(ROLES.ALUMNO)) {
      throw new Error('El usuario no es un alumno');
    }

    const idAlumno = await getAlumnoIdByUsuarioId(data.alumnoId);

    // Si no se indica ciclo lectivo, se usa el año en curso
    const cicloLectivo = data.cicloLectivo ?? new Date().getFullYear();

    // Verificar que la materia existe
    const materia = await materiaRepository.findById(data.materiaId);
    if (!materia) {
      throw new Error('Materia no encontrada');
    }

    // Períodos de inscripción (RAM Art. 20a): el alumno solo puede auto-inscribirse
    // si hay un período MATERIA vigente que habilite el tipo de cursada de la
    // materia. El administrativo puede inscribir fuera de período.
    if (currentUser.rol === ROLES.ALUMNO) {
      const habilitada = await periodoInscripcionService.materiaHabilitada(materia.id);
      if (!habilitada) {
        throw new Error(
          `La materia ${materia.nombre} no está habilitada para inscripción en este período`
        );
      }
    }

    // Verificar que no esté ya inscripto
    const existing = await inscripcionMateriaRepository.findByAlumnoAndMateria(
      idAlumno,
      data.materiaId,
      cicloLectivo
    );
    if (existing) {
      throw new Error('El alumno ya está inscripto en esta materia en este ciclo lectivo');
    }

    // Verificar correlatividades (RFGM5, RFCORRECOMP1, RFCORRECOMP2)
    await this.verificarCorrelatividades(idAlumno, data.materiaId);

    // La institución tiene una sola comisión por materia: vincular la cursada
    // activa de la materia en el ciclo lectivo si existe (si no, queda NULL)
    const cursada = await cursadaRepository.getCursadaActivaByMateria(data.materiaId, cicloLectivo);

    // La baja es lógica (estado BAJA) y la unique (alumnoId, materiaId, cicloLectivo)
    // incluye registros dados de baja: si existe uno, se reactiva en lugar de crear
    const previa = await inscripcionMateriaRepository.findByAlumnoAndMateriaIncludingBaja(
      idAlumno,
      data.materiaId,
      cicloLectivo
    );
    if (previa) {
      return await inscripcionMateriaRepository.update(previa.id, {
        estado: 'ACTIVA',
        fechaInscripcion: new Date(),
        fechaBaja: null,
        cursadaId: cursada?.id ?? null
      });
    }

    return await inscripcionMateriaRepository.create({
      ...data,
      alumnoId: idAlumno,
      cicloLectivo,
      cursadaId: cursada?.id ?? null
    });
  }

  async verificarCorrelatividades(idAlumno: number, materiaId: number) {
    // Obtener correlatividades de la materia
    const correlatividades = await materiaRepository.getCorrelatividades(materiaId);

    if (correlatividades.length === 0) {
      return; // No hay correlatividades, todo ok
    }

    // Régimen oficial: para CURSAR basta tener la correlativa REGULARIZADA
    // (o aprobada). El estado se deriva de notas + asistencia (RAI Arts. 26-37).
    const estadosPorMateria = await estadoAcademicoService.getMapaEstadosPorMateria(idAlumno);
    const aprobadasSet = await estadoAcademicoService.getMateriasAprobadasSet(
      idAlumno,
      estadosPorMateria
    );

    const materiasCumplidas = new Set(aprobadasSet);
    for (const [materiaRequeridaId, estado] of estadosPorMateria) {
      if (estadoAcademicoService.esRegularizado(estado)) {
        materiasCumplidas.add(materiaRequeridaId);
      }
    }

    const resultado = evaluarCorrelatividades({
      modo: 'CURSAR',
      correlatividades,
      materiasCumplidas
    });

    if (!resultado.cumple) {
      const error = resultado.primerError;
      throw new Error(
        `Correlatividad no cumplida: necesitás tener REGULARIZADO ${error.nombreMateria}`
      );
    }
  }

  async darBaja(id: number, currentUser: any) {
    const inscripcion = await inscripcionMateriaRepository.findById(id);
    if (!inscripcion) {
      throw new Error('Inscripción no encontrada');
    }

    // `inscripcion.alumnoId` es idAlumno; `currentUser.id` es el id de cuenta
    if (currentUser.rol !== ROLES.ADMINISTRATIVO) {
      const idAlumno = await getAlumnoIdByUsuarioId(currentUser.id);
      if (idAlumno !== inscripcion.alumnoId) {
        throw new Error('No tienes permisos para dar de baja esta inscripción');
      }
    }

    return await inscripcionMateriaRepository.delete(id);
  }

  async getInscripcionesByAlumno(alumnoId: number, currentUser: any, pagination: { page?: number; limit?: number } = {}) {
    // `alumnoId` es el id de cuenta (Usuario.idUsuario)
    if (currentUser.rol === ROLES.PROFESOR) {
      throw new AppError(403, 'Los profesores deben consultar inscripciones desde sus cursadas');
    }
    if (currentUser.rol !== ROLES.ADMINISTRATIVO && currentUser.id !== alumnoId) {
      throw new Error('No tienes permisos para ver estas inscripciones');
    }

    const idAlumno = await getAlumnoIdByUsuarioId(alumnoId);
    return await inscripcionMateriaRepository.findByAlumnoId(idAlumno, pagination);
  }

  async getInscriptosByMateria(materiaId: number, pagination: { page?: number; limit?: number } = {}, currentUser?: any) {
    if (currentUser?.rol === ROLES.PROFESOR) {
      await verificarPermisoMateria(currentUser, materiaId);
    }
    return await inscripcionMateriaRepository.findByMateriaId(materiaId, pagination);
  }

  async getHistorialAlumnoMateria(alumnoId: number, materiaId: number) {
    // `alumnoId` es el id de cuenta (Usuario.idUsuario)
    const idAlumno = await getAlumnoIdByUsuarioId(alumnoId);
    return await inscripcionMateriaRepository.findHistorialByAlumnoAndMateria(idAlumno, materiaId);
  }

  async cambiarModalidad(id: number, modalidad: string, currentUser: any) {
    const inscripcion = await inscripcionMateriaRepository.findById(id);
    if (!inscripcion) {
      throw new Error('Inscripción no encontrada');
    }

    if (currentUser.rol !== ROLES.ADMINISTRATIVO) {
      throw new Error('Solo administrativos pueden cambiar la modalidad');
    }

    return await inscripcionMateriaRepository.update(id, { modalidadElegida: modalidad });
  }
}

export default new InscripcionMateriaService();
