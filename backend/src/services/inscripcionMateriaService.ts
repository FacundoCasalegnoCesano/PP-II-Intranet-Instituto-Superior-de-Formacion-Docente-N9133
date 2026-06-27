import inscripcionMateriaRepository from '../repositories/inscripcionMateriaRepository.js';
import userRepository from '../repositories/userRepository.js';
import materiaRepository from '../repositories/materiaRepository.js';
import type { InscripcionMateriaCreateData } from '../repositories/inscripcionMateriaRepository.js';
import { ROLES } from '../constants/roles.js';

class InscripcionMateriaService {
  async inscribirAlumno(data: InscripcionMateriaCreateData, currentUser: any) {
    // Verificar que el alumno existe
    const alumno = await userRepository.findById(data.alumnoId);
    if (!alumno) {
      throw new Error('Alumno no encontrado');
    }

    if (alumno.rol !== ROLES.ALUMNO) {
      throw new Error('El usuario no es un alumno');
    }

    // Verificar que la materia existe
    const materia = await materiaRepository.findById(data.materiaId);
    if (!materia) {
      throw new Error('Materia no encontrada');
    }

    // Verificar que no esté ya inscripto
    const existing = await inscripcionMateriaRepository.findByAlumnoAndMateria(
      data.alumnoId,
      data.materiaId,
      data.cicloLectivo
    );
    if (existing) {
      throw new Error('El alumno ya está inscripto en esta materia en este ciclo lectivo');
    }

    // Verificar correlatividades (RFGM5, RFCORRECOMP1, RFCORRECOMP2)
    await this.verificarCorrelatividades(data.alumnoId, data.materiaId);

    return await inscripcionMateriaRepository.create(data);
  }

  async verificarCorrelatividades(alumnoId: number, materiaId: number) {
    // Obtener correlatividades de la materia
    const correlatividades = await materiaRepository.getCorrelatividades(materiaId);
    
    if (correlatividades.length === 0) {
      return; // No hay correlatividades, todo ok
    }

    // Obtener materias aprobadas del alumno
    const aprobadas = await inscripcionMateriaRepository.getMateriasAprobadas(alumnoId);
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

    if (currentUser.rol !== ROLES.ADMINISTRATIVO && currentUser.id !== inscripcion.alumnoId) {
      throw new Error('No tienes permisos para dar de baja esta inscripción');
    }

    return await inscripcionMateriaRepository.delete(id);
  }

  async getInscripcionesByAlumno(alumnoId: number, currentUser: any) {
    if (currentUser.rol !== ROLES.ADMINISTRATIVO && currentUser.id !== alumnoId) {
      throw new Error('No tienes permisos para ver estas inscripciones');
    }

    return await inscripcionMateriaRepository.findByAlumnoId(alumnoId);
  }

  async getInscriptosByMateria(materiaId: number) {
    return await inscripcionMateriaRepository.findByMateriaId(materiaId);
  }

  async getHistorialAlumnoMateria(alumnoId: number, materiaId: number) {
    return await inscripcionMateriaRepository.findHistorialByAlumnoAndMateria(alumnoId, materiaId);
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