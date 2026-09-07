import cursadaRepository from '../repositories/cursadaRepository.js';
import materiaRepository from '../repositories/materiaRepository.js';
import userRepository from '../repositories/userRepository.js';
import { ROLES } from '../constants/roles.js';
import { AppError } from '../utils/AppError.js';
import type { CursadaCreateData, CursadaUpdateData } from '../repositories/cursadaRepository.js';
import { verificarPermisoCursada } from '../utils/docenteHelper.js';

class CursadaService {
  private esAdministrativo(currentUser: any): void {
    if (currentUser.rol !== ROLES.ADMINISTRATIVO) {
      throw new AppError(403, 'Solo administrativos pueden realizar esta acción');
    }
  }

  private async validarDatos(data: CursadaCreateData | CursadaUpdateData, cursadaIdExcluida?: number): Promise<void> {
    if ('materiaId' in data && data.materiaId !== undefined) {
      const materia = await materiaRepository.findById(data.materiaId);
      if (!materia) {
        throw new AppError(404, 'Materia no encontrada');
      }
    }

    if (data.docenteId !== undefined && data.docenteId !== null) {
      const docente = await userRepository.findById(data.docenteId);
      if (!docente) {
        throw new AppError(404, 'Docente no encontrado');
      }
      const tieneRolProfesor = (docente.rol ?? '')
        .split(',')
        .map((r: string) => r.trim())
        .includes(ROLES.PROFESOR);
      if (!tieneRolProfesor) {
        throw new AppError(400, 'El docente asignado debe tener rol PROFESOR');
      }
    }

    // La institución tiene UNA comisión por materia/año/periodo: rechazar duplicados
    const materiaId = 'materiaId' in data && data.materiaId !== undefined ? data.materiaId : undefined;
    const anioLectivo = data.anioLectivo;
    const periodo = data.periodo;
    if (materiaId && anioLectivo && periodo) {
      const existente = await cursadaRepository.findByMateriaAnioPeriodo(materiaId, anioLectivo, periodo);
      if (existente && existente.id !== cursadaIdExcluida) {
        throw new AppError(400, 'Ya existe una cursada de esa materia para ese año lectivo y periodo');
      }
    }
  }

  async createCursada(data: CursadaCreateData, currentUser: any) {
    this.esAdministrativo(currentUser);
    await this.validarDatos(data);
    return await cursadaRepository.create(data);
  }

  async getCursadas(filters: { page?: number; limit?: number; anioLectivo?: number; materiaId?: number; docenteId?: number; activo?: boolean } = {}) {
    return await cursadaRepository.findAll(filters);
  }

  async getCursadaById(id: number) {
    const cursada = await cursadaRepository.findById(id);
    if (!cursada) {
      throw new AppError(404, 'Cursada no encontrada');
    }
    return cursada;
  }

  async updateCursada(id: number, data: CursadaUpdateData, currentUser: any) {
    this.esAdministrativo(currentUser);
    await this.getCursadaById(id);
    await this.validarDatos(data, id);
    return await cursadaRepository.update(id, data);
  }

  async deleteCursada(id: number, currentUser: any) {
    this.esAdministrativo(currentUser);
    await this.getCursadaById(id);
    return await cursadaRepository.delete(id);
  }

  async getInscriptosByCursada(cursadaId: number, currentUser: any) {
    await this.getCursadaById(cursadaId);
    if (currentUser.rol !== ROLES.ADMINISTRATIVO) {
      await verificarPermisoCursada(currentUser, cursadaId);
    }
    return await cursadaRepository.findInscriptosByCursadaId(cursadaId);
  }
}

export default new CursadaService();
