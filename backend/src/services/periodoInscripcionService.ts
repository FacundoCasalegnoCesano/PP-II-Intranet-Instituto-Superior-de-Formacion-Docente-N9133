import periodoInscripcionRepository from '../repositories/periodoInscripcionRepository.js';
import materiaRepository from '../repositories/materiaRepository.js';
import { ROLES } from '../constants/roles.js';
import { prisma } from '../config/prisma.js';
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

    await this.validarSeleccion(data);

    return await periodoInscripcionRepository.create(data);
  }

  /**
   * El período debe habilitar explícitamente su contenido:
   * - MATERIA: al menos una materia existente (selección por carrera/año)
   * - EXAMEN: al menos una mesa existente
   */
  private async validarSeleccion(data: { tipo?: string; materiasIds?: number[]; mesasIds?: number[] }) {
    if (data.tipo === 'MATERIA') {
      const ids = data.materiasIds ?? [];
      if (ids.length === 0) {
        throw new Error('El período debe incluir al menos una materia');
      }
      const existentes = await prisma.materia.findMany({
        where: { id: { in: ids } },
        select: { id: true }
      });
      const encontrados = new Set(existentes.map(materia => materia.id));
      const invalida = ids.find(id => !encontrados.has(id));
      if (invalida !== undefined) throw new Error(`La materia ${invalida} no existe`);
    } else if (data.tipo === 'EXAMEN') {
      const ids = data.mesasIds ?? [];
      if (ids.length === 0) {
        throw new Error('El período debe incluir al menos una mesa de examen');
      }
      const existentes = await prisma.mesa.findMany({
        where: { id: { in: ids }, activo: true },
        select: { id: true }
      });
      const encontrados = new Set(existentes.map(mesa => mesa.id));
      const invalida = ids.find(id => !encontrados.has(id));
      if (invalida !== undefined) throw new Error(`La mesa de examen ${invalida} no existe o está inactiva`);
    }
  }

  /**
   * ¿Existe un período MATERIA vigente que incluya explícitamente esta materia?
   */
  async materiaHabilitada(materiaId: number): Promise<boolean> {
    return await periodoInscripcionRepository.materiaHabilitadaEnPeriodoVigente(materiaId);
  }

  /**
   * ¿Existe un período EXAMEN vigente que incluya explícitamente esta mesa?
   */
  async mesaHabilitada(mesaId: number): Promise<boolean> {
    return await periodoInscripcionRepository.mesaHabilitadaEnPeriodoVigente(mesaId);
  }

  async getPeriodoById(id: number) {
    const periodo = await periodoInscripcionRepository.findById(id);
    if (!periodo) {
      throw new Error('Período no encontrado');
    }
    return periodo;
  }

  async listPeriodos(filters: { tipo?: string; activo?: boolean; cicloLectivo?: number; page?: number; limit?: number } = {}) {
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

    const cambiaSeleccion = data.tipo !== undefined
      || data.materiasIds !== undefined
      || data.mesasIds !== undefined;

    if (cambiaSeleccion) {
      await this.validarSeleccion({
        tipo: data.tipo ?? periodo.tipo,
        materiasIds: data.materiasIds,
        mesasIds: data.mesasIds
      });
    }

    const { materiasIds, mesasIds, ...resto } = data;
    return await prisma.$transaction(async tx => {
      if (materiasIds?.length) {
        await tx.periodoMateriaHabilitada.deleteMany({ where: { periodoInscripcionId: id } });
        await tx.periodoMateriaHabilitada.createMany({
          data: materiasIds.map(materiaId => ({ periodoInscripcionId: id, materiaId }))
        });
      }
      if (mesasIds?.length) {
        await tx.periodoMesaHabilitada.deleteMany({ where: { periodoInscripcionId: id } });
        await tx.periodoMesaHabilitada.createMany({
          data: mesasIds.map(mesaId => ({ periodoInscripcionId: id, mesaId }))
        });
      }
      return tx.periodoInscripcion.update({
        where: { id },
        data: {
          ...resto,
          ...(resto.tipo ? { tipo: resto.tipo as any } : {}),
          ...(resto.fechaInicio ? { fechaInicio: new Date(resto.fechaInicio) } : {}),
          ...(resto.fechaFin ? { fechaFin: new Date(resto.fechaFin) } : {})
        },
        include: { materias: true, mesas: true }
      });
    });
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
