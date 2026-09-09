import libroDeTemaRepository from '../repositories/libroDeTemaRepository.js';
import materiaRepository from '../repositories/materiaRepository.js';
import { ROLES } from '../constants/roles.js';
import { AppError } from '../utils/AppError.js';
import {
  verificarPermisoMateria,
  verificarPermisoMutacionCursada
} from '../utils/docenteHelper.js';
import cursadaRepository from '../repositories/cursadaRepository.js';
import {
  anioInstitucionalActual,
  fechaPerteneceAlAnioLectivo
} from '../utils/cicloLectivo.js';
import type {
  LibroDeTemaCreateData,
  LibroDeTemaUpdateData
} from '../repositories/libroDeTemaRepository.js';

class LibroDeTemaService {
  private async verificarPermisoProfesor(currentUser: any, materiaId: number): Promise<void> {
    await verificarPermisoMateria(currentUser, materiaId);
  }

  private async verificarMutacionProfesor(
    currentUser: any,
    materiaId: number,
    fecha: Date,
    registroHistorico = false
  ): Promise<void> {
    if (currentUser.rol === ROLES.ADMINISTRATIVO) return;

    const anioActual = anioInstitucionalActual();
    const cursada = await cursadaRepository.getCursadaActivaByMateria(materiaId, anioActual);
    if (!cursada) {
      throw new AppError(403, 'Los profesores solo pueden modificar registros de cursadas activas del año institucional');
    }

    await verificarPermisoMutacionCursada(currentUser, cursada.id);
    if (!fechaPerteneceAlAnioLectivo(fecha, cursada.anioLectivo)) {
      throw new AppError(
        registroHistorico ? 403 : 400,
        registroHistorico
          ? 'Los profesores no pueden modificar registros históricos'
          : 'La fecha debe pertenecer al año lectivo de la cursada'
      );
    }
  }

  async list(filters: {
    page?: number;
    limit?: number;
    materiaId?: number;
    fechaDesde?: Date | string;
    fechaHasta?: Date | string;
  } = {}, currentUser?: any) {
    const query: {
      page?: number;
      limit?: number;
      materiaId?: number;
      fechaDesde?: Date;
      fechaHasta?: Date;
      profesorId?: number;
    } = {};
    if (filters.page !== undefined) query.page = filters.page;
    if (filters.limit !== undefined) query.limit = filters.limit;
    if (filters.materiaId !== undefined) query.materiaId = filters.materiaId;
    if (filters.fechaDesde) query.fechaDesde = new Date(filters.fechaDesde);
    if (filters.fechaHasta) query.fechaHasta = new Date(filters.fechaHasta);
    if (currentUser?.rol === ROLES.PROFESOR) query.profesorId = currentUser.id;
    return await libroDeTemaRepository.findAll(query);
  }

  async create(data: LibroDeTemaCreateData, currentUser: any) {
    const materia = await materiaRepository.findById(data.materiaId);
    if (!materia) {
      throw new AppError(404, 'Materia no encontrada');
    }
    await this.verificarMutacionProfesor(currentUser, data.materiaId, data.fecha);
    return await libroDeTemaRepository.create(data);
  }

  async getById(id: number, currentUser?: any) {
    const registro = await libroDeTemaRepository.findById(id);
    if (!registro) {
      throw new AppError(404, 'Registro de libro de temas no encontrado');
    }
    if (currentUser?.rol === ROLES.PROFESOR) {
      await verificarPermisoMateria(currentUser, registro.materiaId);
    }
    return registro;
  }

  async update(id: number, data: LibroDeTemaUpdateData, currentUser: any) {
    const registro = await this.getById(id, currentUser);
    await this.verificarMutacionProfesor(currentUser, registro.materiaId, registro.fecha, true);
    if (data.fecha) {
      await this.verificarMutacionProfesor(currentUser, registro.materiaId, data.fecha);
    }
    return await libroDeTemaRepository.update(id, data);
  }

  async delete(id: number, currentUser: any) {
    if (currentUser.rol !== ROLES.ADMINISTRATIVO) {
      throw new AppError(403, 'Solo administrativos pueden eliminar registros del libro de temas');
    }
    await this.getById(id);
    return await libroDeTemaRepository.delete(id);
  }

  async getByMateria(materiaId: number, currentUser?: any) {
    const materia = await materiaRepository.findById(materiaId);
    if (!materia) {
      throw new AppError(404, 'Materia no encontrada');
    }
    if (currentUser?.rol === ROLES.PROFESOR) {
      await verificarPermisoMateria(currentUser, materiaId);
    }
    return await libroDeTemaRepository.findByMateriaId(materiaId);
  }
}

export default new LibroDeTemaService();
