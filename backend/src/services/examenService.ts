import examenRepository from '../repositories/examenRepository.js';
import materiaRepository from '../repositories/materiaRepository.js';
import userRepository from '../repositories/userRepository.js';
import inscripcionMateriaRepository from '../repositories/inscripcionMateriaRepository.js';
import type { ExamenCreateData, ExamenUpdateData, TribunalCreateData } from '../repositories/examenRepository.js';
import { getAlumnoIdByUsuarioId } from '../utils/alumnoHelper.js';
import { ROLES } from '../constants/roles.js';

class ExamenService {
  // ===== EXÁMENES =====
  async createExamen(data: ExamenCreateData, currentUser: any) {
    // Solo admin puede crear exámenes (RFGE8)
    if (currentUser.rol !== ROLES.ADMINISTRATIVO) {
      throw new Error('Solo administrativos pueden crear exámenes');
    }

    // Verificar que la materia existe
    const materia = await materiaRepository.findById(data.materiaId);
    if (!materia) {
      throw new Error('Materia no encontrada');
    }

    return await examenRepository.createExamen(data);
  }

  async getExamenById(id: number) {
    const examen = await examenRepository.findExamenById(id);
    if (!examen) {
      throw new Error('Examen no encontrado');
    }
    return examen;
  }

  async listExamenes(filters: any) {
    return await examenRepository.findAllExamenes(filters);
  }

  async updateExamen(id: number, data: ExamenUpdateData, currentUser: any) {
    if (currentUser.rol !== ROLES.ADMINISTRATIVO) {
      throw new Error('Solo administrativos pueden actualizar exámenes');
    }

    const examen = await examenRepository.findExamenById(id);
    if (!examen) {
      throw new Error('Examen no encontrado');
    }

    return await examenRepository.updateExamen(id, data);
  }

  async deleteExamen(id: number, currentUser: any) {
    if (currentUser.rol !== ROLES.ADMINISTRATIVO) {
      throw new Error('Solo administrativos pueden eliminar exámenes');
    }

    const examen = await examenRepository.findExamenById(id);
    if (!examen) {
      throw new Error('Examen no encontrado');
    }

    return await examenRepository.deleteExamen(id);
  }

  // ===== TRIBUNALES =====
  async addTribunal(data: TribunalCreateData, currentUser: any) {
    if (currentUser.rol !== ROLES.ADMINISTRATIVO) {
      throw new Error('Solo administrativos pueden asignar tribunales');
    }

    // Verificar que el examen existe
    const examen = await examenRepository.findExamenById(data.examenId);
    if (!examen) {
      throw new Error('Examen no encontrado');
    }

    // Verificar que el profesor existe
    const profesor = await userRepository.findById(data.profesorId);
    if (!profesor || profesor.rol !== ROLES.PROFESOR) {
      throw new Error('Profesor no encontrado o no es profesor');
    }

    return await examenRepository.addTribunal(data);
  }

  async removeTribunal(id: number, currentUser: any) {
    if (currentUser.rol !== ROLES.ADMINISTRATIVO) {
      throw new Error('Solo administrativos pueden eliminar tribunales');
    }

    return await examenRepository.removeTribunal(id);
  }

  // ===== INSCRIPCIÓN A EXÁMENES =====
  async inscribirAlumno(examenId: number, alumnoId: number, condicion: string, currentUser: any) {
    // `alumnoId` es el id de cuenta (Usuario.idUsuario). InscripcionExamen guarda idAlumno.
    const alumno = await userRepository.findById(alumnoId);
    if (!alumno || alumno.rol !== ROLES.ALUMNO) {
      throw new Error('Alumno no encontrado');
    }

    // Si es alumno, solo puede inscribirse a sí mismo
    if (currentUser.rol === ROLES.ALUMNO && currentUser.id !== alumnoId) {
      throw new Error('No puedes inscribir a otro alumno');
    }

    const idAlumno = await getAlumnoIdByUsuarioId(alumnoId);

    // Si es admin, puede inscribir a cualquier alumno

    // Verificar que el examen existe
    const examen = await examenRepository.findExamenById(examenId);
    if (!examen) {
      throw new Error('Examen no encontrado');
    }

    // Verificar que el alumno está inscripto en la materia (RFGE9)
    const inscripcionMateria = await inscripcionMateriaRepository.findByAlumnoAndMateria(
      idAlumno,
      examen.materiaId,
      new Date().getFullYear()
    );
    if (!inscripcionMateria) {
      throw new Error('El alumno no está inscripto en esta materia');
    }

    // Verificar correlatividades (RFGE9)
    await this.verificarCorrelatividadesParaExamen(idAlumno, examen.materiaId);

    return await examenRepository.inscribirAlumno(examenId, idAlumno, condicion);
  }

  async verificarCorrelatividadesParaExamen(idAlumno: number, materiaId: number) {
    // Obtener correlatividades que aplican para rendir (aplicaRendir = true)
    const correlatividades = await materiaRepository.getCorrelatividades(materiaId);
    const correlatividadesRendir = correlatividades.filter((c: any) => c.aplicaRendir);

    if (correlatividadesRendir.length === 0) {
      return;
    }

    // Obtener materias aprobadas del alumno (`idAlumno` es idAlumno)
    const aprobadas = await inscripcionMateriaRepository.getMateriasAprobadas(idAlumno);
    const materiasAprobadasIds = aprobadas.map((a: any) => a.cursada.materiaId);

    // Verificar cada correlatividad
    for (const corr of correlatividadesRendir) {
      if (corr.tipoRequisito === 'OBLIGATORIA') {
        if (!materiasAprobadasIds.includes(corr.materiaRequeridaId)) {
          const materiaRequerida = await materiaRepository.findById(corr.materiaRequeridaId);
          throw new Error(`Falta correlatividad obligatoria para rendir: ${materiaRequerida?.nombre}`);
        }
      }
    }
  }

  async desinscribirAlumno(examenId: number, alumnoId: number, currentUser: any) {
    // Si es alumno, solo puede desinscribirse a sí mismo
    if (currentUser.rol === ROLES.ALUMNO && currentUser.id !== alumnoId) {
      throw new Error('No puedes desinscribir a otro alumno');
    }

    const idAlumno = await getAlumnoIdByUsuarioId(alumnoId);

    // Verificar que el examen existe
    const examen = await examenRepository.findExamenById(examenId);
    if (!examen) {
      throw new Error('Examen no encontrado');
    }

    // Verificar que faltan más de 24 horas (RFBE1)
    const ahora = new Date();
    const horasRestantes = (examen.fecha.getTime() - ahora.getTime()) / (1000 * 60 * 60);
    if (horasRestantes < 24) {
      throw new Error('No puedes darte de baja faltando menos de 24 horas para el examen');
    }

    return await examenRepository.desinscribirAlumno(examenId, idAlumno);
  }

  async getInscriptosByExamen(examenId: number) {
    return await examenRepository.getInscriptosByExamen(examenId);
  }

  async getInscripcionesByAlumno(alumnoId: number, currentUser: any) {
    if (currentUser.rol !== ROLES.ADMINISTRATIVO && currentUser.id !== alumnoId) {
      throw new Error('No tienes permisos para ver estas inscripciones');
    }

    // `alumnoId` es el id de cuenta (Usuario.idUsuario)
    const idAlumno = await getAlumnoIdByUsuarioId(alumnoId);
    return await examenRepository.getInscripcionesByAlumno(idAlumno);
  }

  // ===== CALIFICACIONES =====
  async registrarNota(examenId: number, alumnoId: number, nota: number, currentUser: any) {
    // Solo admin o profesor pueden registrar notas
    if (currentUser.rol !== ROLES.ADMINISTRATIVO && currentUser.rol !== ROLES.PROFESOR) {
      throw new Error('Solo administrativos o profesores pueden registrar notas');
    }

    const examen = await examenRepository.findExamenById(examenId);
    if (!examen) {
      throw new Error('Examen no encontrado');
    }

    // Verificar que el examen existe y la materia tiene nota mínima
    const materia = await materiaRepository.findById(examen.materiaId);
    const notaMinima = materia?.notaMinima || 6;

    if (nota < notaMinima) {
      throw new Error(`La nota mínima para este examen es ${notaMinima}`);
    }

    // `alumnoId` es el id de cuenta (Usuario.idUsuario)
    const idAlumno = await getAlumnoIdByUsuarioId(alumnoId);
    return await examenRepository.registrarNota(examenId, idAlumno, nota);
  }
}

export default new ExamenService();