import inscripcionCarreraRepository from '../repositories/inscripcionCarreraRepository.js';
import userRepository from '../repositories/userRepository.js';
import carreraRepository from '../repositories/carreraRepository.js';
import type { InscripcionCarreraCreateData } from '../repositories/inscripcionCarreraRepository.js';
import { ROLES } from '../constants/roles.js';

class InscripcionCarreraService {
  async inscribirAlumno(data: InscripcionCarreraCreateData, currentUser: any) {
    // Verificar que el alumno existe
    const alumno = await userRepository.findById(data.alumnoId);
    if (!alumno) {
      throw new Error('Alumno no encontrado');
    }

    // Verificar que el usuario sea un alumno
    if (alumno.rol !== ROLES.ALUMNO) {
      throw new Error('El usuario no es un alumno');
    }

    // Verificar que la carrera existe
    const carrera = await carreraRepository.findById(data.carreraId);
    if (!carrera) {
      throw new Error('Carrera no encontrada');
    }

    // Verificar que no esté ya inscripto
    const existing = await inscripcionCarreraRepository.findByAlumnoAndCarrera(
      data.alumnoId,
      data.carreraId
    );
    if (existing) {
      throw new Error('El alumno ya está inscripto en esta carrera');
    }

    // Verificar que el alumno no tenga más de 2 carreras (RFIMC1)
    const count = await inscripcionCarreraRepository.countByAlumno(data.alumnoId);
    if (count >= 2) {
      throw new Error('El alumno ya está inscripto en 2 carreras (máximo permitido)');
    }

    return await inscripcionCarreraRepository.create(data);
  }

  async darBaja(id: number, currentUser: any) {
    const inscripcion = await inscripcionCarreraRepository.findById(id);
    if (!inscripcion) {
      throw new Error('Inscripción no encontrada');
    }

    // Verificar permisos: el mismo alumno o admin
    if (currentUser.rol !== ROLES.ADMINISTRATIVO && currentUser.id !== inscripcion.alumnoId) {
      throw new Error('No tienes permisos para dar de baja esta inscripción');
    }

    return await inscripcionCarreraRepository.delete(id);
  }

  async getInscripcionesByAlumno(alumnoId: number, currentUser: any) {
    // Verificar permisos: el mismo alumno o admin
    if (currentUser.rol !== ROLES.ADMINISTRATIVO && currentUser.id !== alumnoId) {
      throw new Error('No tienes permisos para ver estas inscripciones');
    }

    return await inscripcionCarreraRepository.getCarrerasInscriptas(alumnoId);
  }

  async getInscriptosByCarrera(carreraId: number) {
    return await inscripcionCarreraRepository.findByCarreraId(carreraId);
  }

  async getInscripcionById(id: number) {
    const inscripcion = await inscripcionCarreraRepository.findById(id);
    if (!inscripcion) {
      throw new Error('Inscripción no encontrada');
    }
    return inscripcion;
  }
}

export default new InscripcionCarreraService();