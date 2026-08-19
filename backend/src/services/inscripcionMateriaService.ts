import inscripcionMateriaRepository from '../repositories/inscripcionMateriaRepository.js';
import cursadaRepository from '../repositories/cursadaRepository.js';
import userRepository from '../repositories/userRepository.js';
import materiaRepository from '../repositories/materiaRepository.js';
import type { InscripcionMateriaCreateData } from '../repositories/inscripcionMateriaRepository.js';
import { ROLES } from '../constants/roles.js';
import { getAlumnoIdByUsuarioId } from '../utils/alumnoHelper.js';

class InscripcionMateriaService {
  async inscribirAlumno(data: InscripcionMateriaCreateData, currentUser: any) {
    // `data.alumnoId` es el id de cuenta (Usuario.idUsuario)
    const alumno = await userRepository.findById(data.alumnoId);
    if (!alumno) {
      throw new Error('Alumno no encontrado');
    }

    if (alumno.rol !== ROLES.ALUMNO) {
      throw new Error('El usuario no es un alumno');
    }

    const idAlumno = await getAlumnoIdByUsuarioId(data.alumnoId);

    // Verificar que la materia existe
    const materia = await materiaRepository.findById(data.materiaId);
    if (!materia) {
      throw new Error('Materia no encontrada');
    }

    // Verificar que no esté ya inscripto
    const existing = await inscripcionMateriaRepository.findByAlumnoAndMateria(
      idAlumno,
      data.materiaId,
      data.cicloLectivo
    );
    if (existing) {
      throw new Error('El alumno ya está inscripto en esta materia en este ciclo lectivo');
    }

    // Verificar correlatividades (RFGM5, RFCORRECOMP1, RFCORRECOMP2)
    await this.verificarCorrelatividades(idAlumno, data.materiaId);

    // La institución tiene una sola comisión por materia: vincular la cursada
    // activa de la materia en el ciclo lectivo si existe (si no, queda NULL)
    const cursada = await cursadaRepository.getCursadaActivaByMateria(data.materiaId, data.cicloLectivo);

    return await inscripcionMateriaRepository.create({
      ...data,
      alumnoId: idAlumno,
      cursadaId: cursada?.id ?? null
    });
  }

  async verificarCorrelatividades(idAlumno: number, materiaId: number) {
    // Obtener correlatividades de la materia
    const correlatividades = await materiaRepository.getCorrelatividades(materiaId);
    
    if (correlatividades.length === 0) {
      return; // No hay correlatividades, todo ok
    }

    // Obtener materias aprobadas del alumno
    const aprobadas = await inscripcionMateriaRepository.getMateriasAprobadas(idAlumno);
    const materiasAprobadasIds = aprobadas.map((a: any) => a.cursada.materiaId);

    // Verificar cada correlatividad
    for (const corr of correlatividades) {
      if (corr.tipoRequisito === 'OBLIGATORIA') {
        // Debe tener la materia aprobada
        if (!materiasAprobadasIds.includes(corr.materiaRequeridaId)) {
          const materiaRequerida = await materiaRepository.findById(corr.materiaRequeridaId);
          throw new Error(`Falta correlatividad obligatoria: ${materiaRequerida?.nombre}`);
        }
      } else if (corr.tipoRequisito === 'ALTERNATIVA') {
        // Debe tener al menos una del grupo
        const alternativas = correlatividades.filter((c: any) => 
          c.tipoRequisito === 'ALTERNATIVA' && c.grupo === corr.grupo
        );
        const tieneAlguna = alternativas.some((alt: any) => 
          materiasAprobadasIds.includes(alt.materiaRequeridaId)
        );
        if (!tieneAlguna) {
          throw new Error(`Falta alguna correlatividad alternativa del grupo ${corr.grupo}`);
        }
      } else if (corr.tipoRequisito === 'GRUPO') {
        // Debe tener la cantidad mínima del grupo
        const grupo = correlatividades.filter((c: any) => 
          c.tipoRequisito === 'GRUPO' && c.grupo === corr.grupo
        );
        const aprobadasGrupo = grupo.filter((g: any) => 
          materiasAprobadasIds.includes(g.materiaRequeridaId)
        );
        if (aprobadasGrupo.length < (corr.cantidadMinimaAprobadas || 0)) {
          throw new Error(
            `Falta cumplir con el grupo ${corr.grupo}: necesita ${corr.cantidadMinimaAprobadas} materias aprobadas`
          );
        }
      }
    }
  }

  async darBaja(id: number, currentUser: any) {
    const inscripcion = await inscripcionMateriaRepository.findById(id);
    if (!inscripcion) {
      throw new Error('Inscripción no encontrada');
    }

    // `inscripcion.alumnoId` es idAlumno; `currentUser.id` es el id de cuenta
    const idAlumno = await getAlumnoIdByUsuarioId(currentUser.id);
    if (currentUser.rol !== ROLES.ADMINISTRATIVO && idAlumno !== inscripcion.alumnoId) {
      throw new Error('No tienes permisos para dar de baja esta inscripción');
    }

    return await inscripcionMateriaRepository.delete(id);
  }

  async getInscripcionesByAlumno(alumnoId: number, currentUser: any) {
    // `alumnoId` es el id de cuenta (Usuario.idUsuario)
    if (currentUser.rol !== ROLES.ADMINISTRATIVO && currentUser.id !== alumnoId) {
      throw new Error('No tienes permisos para ver estas inscripciones');
    }

    const idAlumno = await getAlumnoIdByUsuarioId(alumnoId);
    return await inscripcionMateriaRepository.findByAlumnoId(idAlumno);
  }

  async getInscriptosByMateria(materiaId: number) {
    return await inscripcionMateriaRepository.findByMateriaId(materiaId);
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