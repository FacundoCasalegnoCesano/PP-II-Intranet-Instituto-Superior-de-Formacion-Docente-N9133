import alumnoRepository from '../repositories/alumnoRepository.js';
import claseRepository, {
  type ClaseAsistenciaPersistida
} from '../repositories/claseRepository.js';
import { ROLES } from '../constants/roles.js';
import { AppError } from '../utils/AppError.js';
import {
  verificarPermisoCursada,
  verificarPermisoMutacionCursada
} from '../utils/docenteHelper.js';
import { esFechaCalendario } from '../validations/claseValidation.js';
import { fechaPerteneceAlAnioLectivo } from '../utils/cicloLectivo.js';

export interface ClaseAsistenciaInput {
  alumnoId: number;
  presente: boolean;
  justificado?: boolean;
  observacion?: string | null;
}

export interface ClaseWritePayload {
  temaDesarrollado: string;
  asistencias: ClaseAsistenciaInput[];
}

function fechaCalendario(fecha: string): Date {
  if (!esFechaCalendario(fecha)) {
    throw new AppError(400, 'La fecha debe tener el formato YYYY-MM-DD');
  }
  return new Date(`${fecha}T00:00:00.000Z`);
}

function validarPayload(payload: ClaseWritePayload): void {
  if (!payload || typeof payload.temaDesarrollado !== 'string' || !payload.temaDesarrollado.trim()) {
    throw new AppError(400, 'El tema desarrollado es requerido');
  }
  if (!Array.isArray(payload.asistencias) || payload.asistencias.length === 0) {
    throw new AppError(400, 'Debe enviar la asistencia completa de la cursada');
  }
  const ids = payload.asistencias.map(fila => fila.alumnoId);
  if (new Set(ids).size !== ids.length) {
    throw new AppError(400, 'No se permiten alumnos duplicados en la asistencia');
  }
  if (payload.asistencias.some(fila => fila.presente && fila.justificado)) {
    throw new AppError(400, 'Una asistencia presente no puede estar justificada');
  }
}

function validarCiclo(fecha: string, anioLectivo: number): void {
  if (!fechaPerteneceAlAnioLectivo(`${fecha}T00:00:00.000Z`, anioLectivo)) {
    throw new AppError(400, 'La fecha debe pertenecer al año lectivo de la cursada');
  }
}

class ClaseService {
  private async getCursada(cursadaId: number) {
    const cursada = await claseRepository.findCursada(cursadaId);
    if (!cursada) throw new AppError(404, 'Cursada no encontrada');
    return cursada;
  }

  private async prepareRows(cursadaId: number, payload: ClaseWritePayload): Promise<ClaseAsistenciaPersistida[]> {
    validarPayload(payload);
    const inscriptos = await claseRepository.findActiveEnrollments(cursadaId);
    const esperados = new Set(inscriptos.map(inscripto => inscripto.usuarioId));
    const recibidos = new Set(payload.asistencias.map(fila => fila.alumnoId));
    const coberturaCompleta = esperados.size === recibidos.size &&
      [...esperados].every(id => recibidos.has(id));
    if (!coberturaCompleta) {
      throw new AppError(400, 'La asistencia debe contener exactamente un registro por cada inscripto activo');
    }

    const idsUsuario = [...recibidos];
    const alumnos = await alumnoRepository.findByUsuarioIds(idsUsuario);
    const porUsuario = new Map(alumnos.map(alumno => [alumno.idCuenta, alumno.idAlumno]));
    if (alumnos.length !== idsUsuario.length || idsUsuario.some(id => !porUsuario.has(id))) {
      throw new AppError(400, 'Todos los alumnos de la asistencia deben tener una cuenta académica válida');
    }

    return payload.asistencias.map(fila => ({
      idAlumno: porUsuario.get(fila.alumnoId)!,
      presente: fila.presente,
      justificado: fila.justificado ?? false,
      observacion: fila.observacion ?? null
    }));
  }

  async listClasses(cursadaId: number, currentUser: any) {
    await verificarPermisoCursada(currentUser, cursadaId);
    const cursada = await this.getCursada(cursadaId);
    return await claseRepository.findHistory(cursadaId, cursada.materiaId, cursada.anioLectivo);
  }

  async getClass(cursadaId: number, fecha: string, currentUser: any) {
    await verificarPermisoCursada(currentUser, cursadaId);
    const fechaDate = fechaCalendario(fecha);
    const cursada = await this.getCursada(cursadaId);
    validarCiclo(fecha, cursada.anioLectivo);
    const detalle = await claseRepository.findDetail(cursadaId, cursada.materiaId, fechaDate);
    if (!detalle) throw new AppError(404, 'Clase no encontrada');
    return detalle;
  }

  async saveClass(cursadaId: number, fecha: string, payload: ClaseWritePayload, currentUser: any) {
    const fechaDate = fechaCalendario(fecha);
    await verificarPermisoMutacionCursada(currentUser, cursadaId);
    const cursada = await this.getCursada(cursadaId);
    validarCiclo(fecha, cursada.anioLectivo);
    const filas = await this.prepareRows(cursadaId, payload);
    await claseRepository.saveAtomic({
      cursadaId,
      materiaId: cursada.materiaId,
      fecha: fechaDate,
      temaDesarrollado: payload.temaDesarrollado.trim(),
      filas
    });
    return {
      fecha,
      temaDesarrollado: payload.temaDesarrollado.trim(),
      registros: filas.length
    };
  }

  async deleteClass(cursadaId: number, fecha: string, currentUser: any) {
    if (currentUser?.rol !== ROLES.ADMINISTRATIVO) {
      throw new AppError(403, 'Solo administrativos pueden eliminar clases');
    }
    const fechaDate = fechaCalendario(fecha);
    const cursada = await this.getCursada(cursadaId);
    validarCiclo(fecha, cursada.anioLectivo);
    return await claseRepository.deleteAtomic(cursadaId, cursada.materiaId, fechaDate);
  }
}

export default new ClaseService();
