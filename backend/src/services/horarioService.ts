import horarioRepository from '../repositories/horarioRepository.js';
import cursadaRepository from '../repositories/cursadaRepository.js';
import { ROLES } from '../constants/roles.js';
import type { HorarioCreateData, HorarioUpdateData } from '../repositories/horarioRepository.js';
import { verificarPermisoCursada, verificarPermisoMateria } from '../utils/docenteHelper.js';

function minutoDelDia(fecha: Date): number {
  return fecha.getUTCHours() * 60 + fecha.getUTCMinutes();
}

function validarRangoHorario(horaInicio: Date, horaFin: Date): void {
  if (Number.isNaN(horaInicio.getTime()) || Number.isNaN(horaFin.getTime())) {
    throw new Error('El horario ingresado no es válido');
  }
  if (minutoDelDia(horaInicio) >= minutoDelDia(horaFin)) {
    throw new Error('La hora de inicio debe ser menor que la hora de fin');
  }
}

async function existeConflicto(
  cursadaId: number,
  dia: string,
  horaInicio: Date,
  horaFin: Date,
  excludeId?: number
): Promise<boolean> {
  const inicio = minutoDelDia(horaInicio);
  const fin = minutoDelDia(horaFin);
  const horarios = await horarioRepository.findActiveByCursadaAndDay(cursadaId, dia, excludeId);
  return horarios.some(horario => (
    inicio < minutoDelDia(horario.horaFin)
    && fin > minutoDelDia(horario.horaInicio)
  ));
}

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

    validarRangoHorario(horaInicio, horaFin);

    const tieneConflicto = await existeConflicto(
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

  async getHorarioById(id: number, currentUser?: any) {
    const horario = await horarioRepository.findById(id);
    if (!horario) {
      throw new Error('Horario no encontrado');
    }
    if (currentUser?.rol === ROLES.PROFESOR) await verificarPermisoCursada(currentUser, horario.cursadaId);
    return horario;
  }

  async getHorariosByCursada(cursadaId: number, currentUser?: any) {
    if (currentUser?.rol === ROLES.PROFESOR) await verificarPermisoCursada(currentUser, cursadaId);
    return await horarioRepository.findByCursadaId(cursadaId);
  }

  async getHorariosByMateria(materiaId: number, currentUser?: any) {
    if (currentUser?.rol === ROLES.PROFESOR) await verificarPermisoMateria(currentUser, materiaId);
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

      validarRangoHorario(horaInicio, horaFin);

      const tieneConflicto = await existeConflicto(
        horario.cursadaId,
        dia,
        horaInicio,
        horaFin,
        id
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
