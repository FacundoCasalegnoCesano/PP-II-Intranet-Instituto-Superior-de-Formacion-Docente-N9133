import carreraRepository from '../repositories/carreraRepository.js';
import type { CarreraFilters, CarreraCreateData, CarreraUpdateData } from '../repositories/carreraRepository.js';
import { ROLES } from '../constants/roles.js';
import { AppError } from '../utils/AppError.js';

class CarreraService {
  async createCarrera(data: CarreraCreateData) {
    // Verificar si ya existe
    const existing = await carreraRepository.findByNombre(data.nombre);
    if (existing) {
      throw new Error('Ya existe una carrera con ese nombre');
    }

    return await carreraRepository.create(data);
  }

  async getCarreraById(id: number) {
    const carrera = await carreraRepository.findById(id);
    if (!carrera) {
      throw new Error('Carrera no encontrada');
    }
    return carrera;
  }

  async listCarreras(filters: CarreraFilters = {}) {
    return await carreraRepository.findAll(filters);
  }

  async listCatalogo(filters: CarreraFilters = {}) {
    return await carreraRepository.findAll({ ...filters, activo: true });
  }

  async updateCarrera(id: number, data: CarreraUpdateData) {
    const carrera = await carreraRepository.findById(id);
    if (!carrera) {
      throw new Error('Carrera no encontrada');
    }

    // Verificar nombre único
    if (data.nombre && data.nombre !== carrera.nombre) {
      const existing = await carreraRepository.findByNombre(data.nombre);
      if (existing) {
        throw new Error('Ya existe una carrera con ese nombre');
      }
    }

    return await carreraRepository.update(id, data);
  }

  async deleteCarrera(id: number) {
    const carrera = await carreraRepository.findById(id);
    if (!carrera) {
      throw new Error('Carrera no encontrada');
    }

    // Verificar si tiene materias asociadas
    if (carrera.materias && carrera.materias.length > 0) {
      throw new Error('No se puede eliminar la carrera porque tiene materias asociadas');
    }

    return await carreraRepository.delete(id);
  }

  async getPlanEstudio(id: number, currentUser?: any) {
    const plan = await carreraRepository.getPlanEstudio(id);
    if (!plan) {
      throw new AppError(404, 'Carrera no encontrada');
    }
    if (currentUser?.rol === ROLES.ALUMNO && !plan.activo) {
      throw new AppError(404, 'Carrera no encontrada');
    }
    return plan;
  }
}

export default new CarreraService();
