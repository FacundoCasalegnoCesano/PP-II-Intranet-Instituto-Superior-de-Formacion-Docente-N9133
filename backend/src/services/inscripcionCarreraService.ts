import inscripcionCarreraRepository from '../repositories/inscripcionCarreraRepository.js';
import userRepository from '../repositories/userRepository.js';
import carreraRepository from '../repositories/carreraRepository.js';
import type { InscripcionCarreraCreateData } from '../repositories/inscripcionCarreraRepository.js';
import { ROLES } from '../constants/roles.js';
import { AppError } from '../utils/AppError.js';

class InscripcionCarreraService {
  async inscribirAlumno(data: InscripcionCarreraCreateData, currentUser: any) {
    if (currentUser.rol !== ROLES.ADMINISTRATIVO) {
      throw new AppError(403, 'Solo administrativos pueden inscribir alumnos a carreras');
    }
    // Verificar que el alumno existe (data.usuarioId = id de cuenta)
    const alumno = await userRepository.findById(data.usuarioId);
    if (!alumno) {
      throw new AppError(404, 'Alumno no encontrado');
    }

    // Verificar que el usuario tenga el rol de alumno (puede tener roles múltiples)
    const rolesAlumno = (alumno.rol ?? '').split(',').map((rol: string) => rol.trim());
    if (!rolesAlumno.includes(ROLES.ALUMNO)) {
      throw new AppError(400, 'El usuario no es un alumno');
    }

    // Verificar que la carrera existe
    const carrera = await carreraRepository.findById(data.carreraId);
    if (!carrera) {
      throw new AppError(404, 'Carrera no encontrada');
    }

    // Si no se indica ciclo lectivo, se usa el año en curso
    data.cicloLectivo = data.cicloLectivo ?? new Date().getFullYear();

    // Verificar que no esté ya inscripto
    const existing = await inscripcionCarreraRepository.findByUsuarioAndCarrera(
      data.usuarioId,
      data.carreraId
    );
    if (existing) {
      throw new AppError(400, 'El alumno ya está inscripto en esta carrera');
    }

    // Verificar que el alumno no tenga más de 2 carreras (RFIMC1)
    const count = await inscripcionCarreraRepository.countByUsuario(data.usuarioId);
    if (count >= 2) {
      throw new AppError(400, 'El alumno ya está inscripto en 2 carreras (máximo permitido)');
    }

    return await inscripcionCarreraRepository.create(data);
  }

  async darBaja(id: number, currentUser: any) {
    if (currentUser.rol !== ROLES.ADMINISTRATIVO) {
      throw new AppError(403, 'Solo administrativos pueden dar de baja inscripciones a carreras');
    }
    const inscripcion = await inscripcionCarreraRepository.findById(id);
    if (!inscripcion) {
      throw new AppError(404, 'Inscripción no encontrada');
    }

    // Verificar permisos: el mismo alumno o admin
    if (currentUser.rol !== ROLES.ADMINISTRATIVO && currentUser.id !== inscripcion.usuarioId) {
      throw new AppError(403, 'No tienes permisos para dar de baja esta inscripción');
    }

    return await inscripcionCarreraRepository.delete(id);
  }

  async getInscripcionesByAlumno(alumnoId: number, currentUser: any) {
    // Verificar permisos: el mismo alumno o admin
    if (currentUser.rol === ROLES.PROFESOR) {
      throw new AppError(403, 'Los profesores no pueden consultar inscripciones globales a carreras');
    }
    if (currentUser.rol !== ROLES.ADMINISTRATIVO && currentUser.id !== alumnoId) {
      throw new AppError(403, 'No tienes permisos para ver estas inscripciones');
    }

    return await inscripcionCarreraRepository.getCarrerasInscriptas(alumnoId);
  }

  async getInscriptosByCarrera(carreraId: number, pagination: { page?: number; limit?: number } = {}) {
    return await inscripcionCarreraRepository.findByCarreraId(carreraId, pagination);
  }

  async getInscripcionById(id: number) {
    const inscripcion = await inscripcionCarreraRepository.findById(id);
    if (!inscripcion) {
      throw new AppError(404, 'Inscripción no encontrada');
    }
    return inscripcion;
  }
}

export default new InscripcionCarreraService();
