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
    if (alumno.activo === false) {
      throw new AppError(400, 'El alumno está inactivo');
    }

    // Verificar que el usuario tenga el rol de alumno (puede tener roles múltiples)
    const rolesAlumno = (alumno.rol ?? '').split(',').map((rol: string) => rol.trim());
    if (!rolesAlumno.includes(ROLES.ALUMNO)) {
      throw new AppError(400, 'El usuario no es un alumno');
    }

    // Verificar que la carrera existe
    const carrera = await carreraRepository.findById(data.carreraId);
    if (!carrera || !carrera.activo) {
      throw new AppError(404, 'Carrera no encontrada');
    }

    const previa = await inscripcionCarreraRepository.findByUsuarioAndCarreraIncludingBaja(
      data.usuarioId,
      data.carreraId
    );
    if (!previa && (
      !Number.isInteger(data.anioCohorte) ||
      data.anioCohorte! < 1900 ||
      data.anioCohorte! > 2100
    )) {
      throw new AppError(400, 'El año de cohorte es requerido para una inscripción nueva');
    }

    return await inscripcionCarreraRepository.inscribirAtomic(data);
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

  async getInscripcionesByAlumno(
    alumnoId: number,
    currentUser: any,
    options: { includeInactive?: boolean } = {}
  ) {
    // Verificar permisos: el mismo alumno o admin
    if (currentUser.rol === ROLES.PROFESOR) {
      throw new AppError(403, 'Los profesores no pueden consultar inscripciones globales a carreras');
    }
    if (currentUser.rol !== ROLES.ADMINISTRATIVO && currentUser.id !== alumnoId) {
      throw new AppError(403, 'No tienes permisos para ver estas inscripciones');
    }

    if (options.includeInactive && currentUser.rol !== ROLES.ADMINISTRATIVO) {
      throw new AppError(403, 'Solo administrativos pueden consultar inscripciones históricas');
    }

    if (options.includeInactive === true) {
      return await inscripcionCarreraRepository.getCarrerasInscriptas(alumnoId, true);
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

  async actualizarCohorte(id: number, anioCohorte: number | null, currentUser: any) {
    if (currentUser.rol !== ROLES.ADMINISTRATIVO) {
      throw new AppError(403, 'Solo administrativos pueden editar el año de cohorte');
    }
    const inscripcion = await inscripcionCarreraRepository.findById(id);
    if (!inscripcion) throw new AppError(404, 'Inscripción no encontrada');
    return inscripcionCarreraRepository.update(id, { anioCohorte });
  }
}

export default new InscripcionCarreraService();
