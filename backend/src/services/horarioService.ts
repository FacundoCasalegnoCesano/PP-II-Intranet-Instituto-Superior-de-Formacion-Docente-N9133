import horarioRepository from '../repositories/horarioRepository.js';
import cursadaRepository from '../repositories/cursadaRepository.js';
import { ROLES } from '../constants/roles.js';
import type { HorarioCreateData, HorarioUpdateData } from '../repositories/horarioRepository.js';

class HorarioService {
  async crearHorario(data: HorarioCreateData, currentUser: any) {
    // Solo Admin puede crear horarios
    if (currentUser.rol !== ROLES.ADMINISTRATIVO) {
      throw new Error('Solo administrativos pueden crear horarios');
    }

    // Verificar que la cursada existe
    const cursada = await cursadaRepository.findById(data.cursadaId);
    if (!cursada) {
      throw new Error('Cursada no encontrada');
    }

    // Verificar conflictos de horario
    const horaInicio = new Date(data.horaInicio);
    const horaFin = new Date(data.horaFin);

    if (horaInicio >= horaFin) {
      throw new Error('La hora de inicio debe ser menor que la hora de fin');
    }

    const tieneConflicto = await horarioRepository.verificarConflictos(
      data.cursadaId,
      data.dia,
      horaInicio,
      horaFin
    );

    if (tieneConflicto) {
      throw new Error('Ya existe un horario en ese día y horario para esta cursada');
    }

    return await horarioRepository.create(data);
  }

  async getHorarioById(id: number) {
    const horario = await horarioRepository.findById(id);
    if (!horario) {
      throw new Error('Horario no encontrado');
    }
    return horario;
  }

  async getHorariosByCursada(cursadaId: number) {
    return await horarioRepository.findByCursadaId(cursadaId);
  }

  async getHorariosByMateria(materiaId: number) {
    return await horarioRepository.findByMateriaId(materiaId);
  }

  async updateHorario(id: number, data: HorarioUpdateData, currentUser: any) {
    if (currentUser.rol !== ROLES.ADMINISTRATIVO) {
      throw new Error('Solo administrativos pueden actualizar horarios');
    }

    const horario = await horarioRepository.findById(id);
    if (!horario) {
      throw new Error('Horario no encontrado');
    }

    // Verificar conflictos si se actualiza día/hora
    if (data.dia || data.horaInicio || data.horaFin) {
      const dia = data.dia || horario.dia;
      const horaInicio = data.horaInicio ? new Date(data.horaInicio) : horario.horaInicio;
      const horaFin = data.horaFin ? new Date(data.horaFin) : horario.horaFin;

      if (horaInicio >= horaFin) {
        throw new Error('La hora de inicio debe ser menor que la hora de fin');
      }

      const tieneConflicto = await horarioRepository.verificarConflictos(
        horario.cursadaId,
        dia,
        horaInicio,
        horaFin
      );

      if (tieneConflicto) {
        throw new Error('Ya existe un horario en ese día y horario para esta cursada');
      }
    }

    return await horarioRepository.update(id, data);
  }

  async deleteHorario(id: number, currentUser: any) {
    if (currentUser.rol !== ROLES.ADMINISTRATIVO) {
      throw new Error('Solo administrativos pueden eliminar horarios');
    }

    const horario = await horarioRepository.findById(id);
    if (!horario) {
      throw new Error('Horario no encontrado');
    }

    return await horarioRepository.delete(id);
  }
}

export default new HorarioService();