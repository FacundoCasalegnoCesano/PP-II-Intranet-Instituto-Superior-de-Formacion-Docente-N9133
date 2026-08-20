import periodoInscripcionRepository from '../repositories/periodoInscripcionRepository.js';
import { ROLES } from '../constants/roles.js';
import type { PeriodoInscripcionCreateData, PeriodoInscripcionUpdateData } from '../repositories/periodoInscripcionRepository.js';

class PeriodoInscripcionService {
  async crearPeriodo(data: PeriodoInscripcionCreateData, currentUser: any) {
    if (currentUser.rol !== ROLES.ADMINISTRATIVO) {
      throw new Error('Solo administrativos pueden crear períodos de inscripción');
    }

    const fechaInicio = new Date(data.fechaInicio);
    const fechaFin = new Date(data.fechaFin);

    if (fechaInicio >= fechaFin) {
      throw new Error('La fecha de inicio debe ser menor que la fecha de fin');
    }

    return await periodoInscripcionRepository.create(data);
  }

  async getPeriodoById(id: number) {
    const periodo = await periodoInscripcionRepository.findById(id);
    if (!periodo) {
      throw new Error('Período no encontrado');
    }
    return periodo;
  }

  async listPeriodos(filters: { tipo?: string; activo?: boolean } = {}): Promise<any[]> {
    return await periodoInscripcionRepository.findAll(filters);
  }

  async listPeriodosActivos(tipo: string): Promise<any[]> {
    return await periodoInscripcionRepository.findActivosByTipo(tipo);
  }

  async updatePeriodo(id: number, data: PeriodoInscripcionUpdateData, currentUser: any) {
    if (currentUser.rol !== ROLES.ADMINISTRATIVO) {
      throw new Error('Solo administrativos pueden actualizar períodos de inscripción');
    }

    const periodo = await periodoInscripcionRepository.findById(id);
    if (!periodo) {
      throw new Error('Período no encontrado');
    }

    // Validar fechas
    const fechaInicio = data.fechaInicio ? new Date(data.fechaInicio) : periodo.fechaInicio;
    const fechaFin = data.fechaFin ? new Date(data.fechaFin) : periodo.fechaFin;

    if (fechaInicio >= fechaFin) {
      throw new Error('La fecha de inicio debe ser menor que la fecha de fin');
    }

    return await periodoInscripcionRepository.update(id, data);
  }

  async deletePeriodo(id: number, currentUser: any) {
    if (currentUser.rol !== ROLES.ADMINISTRATIVO) {
      throw new Error('Solo administrativos pueden eliminar períodos de inscripción');
    }

    const periodo = await periodoInscripcionRepository.findById(id);
    if (!periodo) {
      throw new Error('Período no encontrado');
    }

    return await periodoInscripcionRepository.delete(id);
  }

  async verificarInscripcionHabilitada(tipo: string): Promise<boolean> {
    return await periodoInscripcionRepository.isInscripcionHabilitada(tipo);
  }
}

export default new PeriodoInscripcionService();