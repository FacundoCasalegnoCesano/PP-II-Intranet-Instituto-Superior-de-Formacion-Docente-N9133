import inscripcionCarreraRepository from '../repositories/inscripcionCarreraRepository.js';
import userRepository from '../repositories/userRepository.js';
import carreraRepository from '../repositories/carreraRepository.js';
import type { InscripcionCarreraCreateData } from '../repositories/inscripcionCarreraRepository.js';
import { ROLES } from '../constants/roles.js';

class InscripcionCarreraService {
  async inscribirAlumno(data: InscripcionCarreraCreateData, currentUser: any) {
    // Verificar que el alumno existe (data.usuarioId = id de cuenta)
    const alumno = await userRepository.findById(data.usuarioId);
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

    // Si no se indica ciclo lectivo, se usa el año en curso
    data.cicloLectivo = data.cicloLectivo ?? new Date().getFullYear();

    // Verificar que no esté ya inscripto
    const existing = await inscripcionCarreraRepository.findByUsuarioAndCarrera(
      data.usuarioId,
      data.carreraId
    );
    if (existing) {
      throw new Error('El alumno ya está inscripto en esta carrera');
    }

    // Verificar que el alumno no tenga más de 2 carreras (RFIMC1)
    const count = await inscripcionCarreraRepository.countByUsuario(data.usuarioId);
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
    if (currentUser.rol !== ROLES.ADMINISTRATIVO && currentUser.id !== inscripcion.usuarioId) {
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

  async getInscriptosByCarrera(carreraId: number, pagination: { page?: number; limit?: number } = {}) {
    return await inscripcionCarreraRepository.findByCarreraId(carreraId, pagination);
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
