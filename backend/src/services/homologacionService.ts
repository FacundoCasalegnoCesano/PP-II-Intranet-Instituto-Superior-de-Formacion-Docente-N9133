import homologacionRepository from '../repositories/homologacionRepository.js';
import materiaRepository from '../repositories/materiaRepository.js';
import alumnoRepository from '../repositories/alumnoRepository.js';
import type { HomologacionCreateData, HomologacionUpdateData } from '../repositories/homologacionRepository.js';
import type { HomologacionFilters } from '../repositories/homologacionRepository.js';
import { ROLES } from '../constants/roles.js';
import userRepository from '../repositories/userRepository.js';
import { AppError } from '../utils/AppError.js';
import inscripcionCarreraRepository from '../repositories/inscripcionCarreraRepository.js';
import { toHomologacionDto } from '../dtos/homologacionDto.js';

class HomologacionService {
  // ===== CREAR SOLICITUD (Admin) =====
  async crearSolicitud(data: HomologacionCreateData, currentUser: any): Promise<any> {
    this.assertAdministrative(currentUser);

    // Validar alumno existe y es alumno (data.alumnoId = idUsuario, igual que en inscripciones)
    const cuenta = await userRepository.findById(data.alumnoId);
    if (!cuenta) {
      throw new AppError(404, 'Alumno no encontrado');
    }
    if (cuenta.activo !== true) {
      throw new AppError(403, 'El alumno está inactivo');
    }
    const rolesAlumno = (cuenta.rol ?? '').split(',').map((rol: string) => rol.trim());
    if (!rolesAlumno.includes(ROLES.ALUMNO)) {
      throw new AppError(403, 'El usuario no es un alumno');
    }

    const alumno = await alumnoRepository.findByUsuarioId(data.alumnoId);
    if (!alumno) {
      throw new AppError(404, 'El usuario no tiene un registro de alumno asociado');
    }

    // Validar materia existe
    const materia = await materiaRepository.findById(data.materiaId);
    if (!materia) {
      throw new AppError(404, 'La materia no existe');
    }

    const carreraId = materia.carreraId ?? materia.carrera?.id;
    if (!carreraId || !await inscripcionCarreraRepository.findByUsuarioAndCarrera(data.alumnoId, carreraId)) {
      throw new AppError(400, 'El alumno no tiene una inscripción activa en la carrera de la materia');
    }

    // TOTAL necesita la nota de la institución anterior; PARCIAL comienza sin nota definitiva.
    if (data.tipoHomologacion === 'TOTAL' &&
      (typeof data.calificacion !== 'number' || !Number.isInteger(data.calificacion) || data.calificacion < 0 || data.calificacion > 10)) {
      throw new AppError(400, 'La calificación de la institución anterior debe ser un número entero entre 0 y 10');
    }

    // Verificar que no exista ya una homologación para este alumno/materia
    const existente = await prisma.homologacion.findUnique({
      where: {
        alumnoId_materiaId: { alumnoId: alumno.idAlumno, materiaId: data.materiaId }
      }
    });
    if (existente) {
      throw new AppError(409, 'Ya existe una solicitud de homologación para este alumno y materia');
    }

    const created = await homologacionRepository.create({
      ...data,
      alumnoId: alumno.idAlumno,
      calificacion: data.tipoHomologacion === 'PARCIAL' ? null : data.calificacion
    });
    return toHomologacionDto(created);
  }

  // ===== MIS SOLICITUDES (Alumno) =====
  async getMisSolicitudes(alumnoUsuarioId: number): Promise<any[]> {
    const alumno = await alumnoRepository.findByUsuarioId(alumnoUsuarioId);
    if (!alumno) {
      throw new AppError(404, 'Alumno no encontrado');
    }
    const solicitudes = await homologacionRepository.findByAlumno(alumno.idAlumno);
    return solicitudes.map(toHomologacionDto);
  }

  // ===== LISTAR CON FILTROS (Admin) =====
  async listar(filters: HomologacionFilters = {}, currentUser: any) {
    this.assertAdministrative(currentUser);
    const result = await homologacionRepository.findAll(filters);
    return { ...result, data: result.data.map(toHomologacionDto) };
  }

  async obtener(id: number, currentUser: any) {
    this.assertAdministrative(currentUser);
    const homologacion = await homologacionRepository.findById(id);
    if (!homologacion) {
      throw new AppError(404, 'Solicitud de homologación no encontrada');
    }
    return toHomologacionDto(homologacion);
  }

  // ===== CARGAR NOTA DEL COMPLEMENTARIO (Admin) =====
  async cargarNotaComplementaria(id: number, notaExamenHomologacion: number, currentUser: any): Promise<any> {
    this.assertAdministrative(currentUser);
    this.assertPositiveId(id);
    const homologacion = await this.getById(id);
    if (!homologacion) {
      throw new AppError(404, 'Solicitud de homologación no encontrada');
    }

    if (homologacion.tipoHomologacion !== 'PARCIAL') {
      throw new AppError(400, 'Solo las homologaciones parciales requieren nota de examen complementario');
    }

    if (homologacion.estado !== 'PENDIENTE') {
      throw new AppError(409, 'Solo se pueden cargar notas en solicitudes PENDIENTES');
    }

    const materia = await materiaRepository.findById(homologacion.materiaId);
    if (!materia) {
      throw new AppError(404, 'Materia asociada no encontrada');
    }

    if (!Number.isInteger(notaExamenHomologacion) || notaExamenHomologacion < 0 || notaExamenHomologacion > 10) {
      throw new AppError(400, 'La nota del examen complementario debe ser un número entero entre 0 y 10');
    }

    const updated = await homologacionRepository.update(id, {
      notaExamenHomologacion,
      observacion: 'Nota de examen complementario registrada'
    });
    return toHomologacionDto(updated);
  }

  // ===== RESOLVER (APROBAR/RECHAZAR) (Admin) =====
  async resolver(id: number, accion: 'APROBAR' | 'RECHAZAR', currentUser: any): Promise<any> {
    this.assertAdministrative(currentUser);
    this.assertPositiveId(id);
    const homologacion = await this.getById(id);
    if (!homologacion) {
      throw new AppError(404, 'Solicitud de homologación no encontrada');
    }

    if (homologacion.estado !== 'PENDIENTE') {
      throw new AppError(409, 'Solo se pueden resolver solicitudes en estado PENDIENTE');
    }

    if (accion !== 'APROBAR' && accion !== 'RECHAZAR') {
      throw new AppError(400, 'La acción debe ser APROBAR o RECHAZAR');
    }

    if (accion === 'RECHAZAR') {
      return toHomologacionDto(await homologacionRepository.update(id, { estado: 'RECHAZADA' }));
    }

    // APROBAR
    if (homologacion.tipoHomologacion === 'PARCIAL') {
      // Para parcial, exigir nota del complementario cargada y >= notaMinima
      if (homologacion.notaExamenHomologacion === null || homologacion.notaExamenHomologacion === undefined) {
        throw new AppError(400, 'Para aprobar una homologación parcial, primero debe cargar la nota del examen complementario');
      }
      const materia = await materiaRepository.findById(homologacion.materiaId);
      if (!materia) {
        throw new AppError(404, 'Materia no encontrada');
      }
      if (homologacion.notaExamenHomologacion < (materia.notaMinima ?? 6)) {
        throw new AppError(400, `La nota del examen complementario (${homologacion.notaExamenHomologacion}) debe ser >= ${materia.notaMinima ?? 6}`);
      }

      return toHomologacionDto(await homologacionRepository.update(id, {
        estado: 'APROBADA',
        calificacion: homologacion.notaExamenHomologacion
      }));
    }

    if (!Number.isFinite(homologacion.calificacion)) {
      throw new AppError(400, 'Una homologación total necesita la nota de la institución anterior para ser aprobada');
    }

    // TOTAL: no requiere nota complementaria, se aprueba directo con la calificación original.
    return toHomologacionDto(await homologacionRepository.update(id, {
      estado: 'APROBADA'
    }));
  }

  private assertAdministrative(currentUser: any): void {
    // authMiddleware garantiza que el usuario HTTP esté activo. Cuando el actor
    // llega con el flag explícito, también lo defendemos en la capa de servicio.
    if (!currentUser || currentUser.rol !== ROLES.ADMINISTRATIVO || currentUser.activo === false) {
      throw new AppError(403, 'Se requiere un usuario administrativo activo');
    }
  }

  private assertPositiveId(id: number): void {
    if (!Number.isInteger(id) || id < 1) {
      throw new AppError(400, 'ID de homologación inválido');
    }
  }

  private async getById(id: number): Promise<any> {
    return await homologacionRepository.findById(id);
  }
}

// Import prisma for direct queries
import { prisma } from '../config/prisma.js';

export default new HomologacionService();
