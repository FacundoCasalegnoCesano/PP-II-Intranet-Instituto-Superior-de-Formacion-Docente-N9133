import cursadaRepository from '../repositories/cursadaRepository.js';
import materiaRepository from '../repositories/materiaRepository.js';
import userRepository from '../repositories/userRepository.js';
import { ROLES } from '../constants/roles.js';
import { AppError } from '../utils/AppError.js';
import type {
  CursadaCreateData,
  CursadaUpdateData,
  InscriptoPublico
} from '../repositories/cursadaRepository.js';
import { puedeMutarCursada, verificarPermisoCursada } from '../utils/docenteHelper.js';
import { anioInstitucionalActual } from '../utils/cicloLectivo.js';

function definedFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

function presentarMateriaPublica(materia: any): Record<string, unknown> | null {
  if (!materia) return null;
  return definedFields({
    id: materia.id,
    nombre: materia.nombre,
    carreraId: materia.carreraId,
    cargaHoraria: materia.cargaHoraria,
    horasCatedra: materia.horasCatedra,
    tipoEspacio: materia.tipoEspacio,
    modalidad: materia.modalidad,
    periodo: materia.periodo,
    regimen: materia.regimen,
    notaMinima: materia.notaMinima,
    asistenciaRequerida: materia.asistenciaRequerida,
    tpRequeridos: materia.tpRequeridos,
    esPromocionable: materia.esPromocionable,
    notaPromocion: materia.notaPromocion,
    aniosRegularidad: materia.aniosRegularidad,
    activo: materia.activo,
    carrera: materia.carrera,
    curso: materia.curso
  });
}

function estadoCursadaPublica(cursada: { anioLectivo: number; activo: boolean }): 'FINALIZADA' | 'ACTIVA' | 'INACTIVA' {
  if (cursada.anioLectivo < anioInstitucionalActual()) return 'FINALIZADA';
  return cursada.activo ? 'ACTIVA' : 'INACTIVA';
}

function presentarCursadaPublica(cursada: any, editable: boolean) {
  return {
    id: cursada.id,
    materiaId: cursada.materiaId,
    materia: presentarMateriaPublica(cursada.materia),
    anioLectivo: cursada.anioLectivo,
    estadoCursada: estadoCursadaPublica(cursada),
    periodo: cursada.periodo,
    docenteId: cursada.docenteId ?? null,
    docente: cursada.docente ?? null,
    ...(cursada.cursadaEspacio ? { espacioCurricular: {
      id: cursada.cursadaEspacio.espacioCurricular.id,
      nombre: cursada.cursadaEspacio.espacioCurricular.nombre
    } } : {}),
    horarios: cursada.horarios ?? [],
    activo: cursada.activo,
    editable
  };
}

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

  private async validarMateriaNoEsComponenteDeEspacio(materiaId: number): Promise<void> {
    const materia = await materiaRepository.findById(materiaId);
    if (materia?.espacioCurricular?.activo) {
      throw new AppError(409, `La materia pertenece al espacio ${materia.espacioCurricular.nombre}; creá la cursada desde el espacio curricular`);
    }
  }

  async createCursada(data: CursadaCreateData, currentUser: any) {
    this.esAdministrativo(currentUser);
    await this.validarMateriaNoEsComponenteDeEspacio(data.materiaId);
    await this.validarDatos(data);
    return await cursadaRepository.create(data);
  }

  async getCursadas(filters: { page?: number; limit?: number; anioLectivo?: number; materiaId?: number; docenteId?: number; activo?: boolean } = {}, currentUser?: any) {
    let result;
    if (currentUser?.rol === ROLES.PROFESOR) {
      const { docenteId: _ignored, ...profesorFilters } = filters;
      result = await cursadaRepository.findAllForProfesor({ ...profesorFilters, profesorId: currentUser.id });
    } else {
      if (currentUser && currentUser.rol !== ROLES.ADMINISTRATIVO) {
        throw new AppError(403, 'No tienes permisos para listar cursadas');
      }
      result = await cursadaRepository.findAll(filters);
    }

    if (!result) {
      throw new AppError(403, 'No tienes permisos para listar cursadas');
    }

    return {
      ...result,
      data: result.data.map((cursada: any) => {
        const materia = cursada.materia;
        const materiaSinAsignaciones = materia
          ? (({ profesorMaterias: _profesorMaterias, ...rest }: any) => rest)(materia)
          : materia;
        return {
          ...cursada,
          estadoCursada: estadoCursadaPublica(cursada),
          ...(materia ? { materia: materiaSinAsignaciones } : {}),
          ...(cursada.cursadaEspacio ? { espacioCurricular: {
            id: cursada.cursadaEspacio.espacioCurricular.id,
            nombre: cursada.cursadaEspacio.espacioCurricular.nombre
          } } : {}),
          editable: currentUser ? puedeMutarCursada(currentUser, cursada) : false
        };
      })
    };
  }

  async getCursadaById(id: number, currentUser?: any) {
    const cursada = await cursadaRepository.findById(id);
    if (!cursada) {
      throw new AppError(404, 'Cursada no encontrada');
    }
    if (currentUser?.rol === ROLES.PROFESOR) {
      await verificarPermisoCursada(currentUser, id);
    }
    if (currentUser && currentUser.rol !== ROLES.ADMINISTRATIVO && currentUser.rol !== ROLES.PROFESOR) {
      throw new AppError(403, 'No tienes permisos para consultar cursadas');
    }
    const editable = currentUser?.rol === ROLES.ADMINISTRATIVO || (
      currentUser?.rol === ROLES.PROFESOR &&
      cursada.activo &&
      cursada.anioLectivo === anioInstitucionalActual()
    );
    return presentarCursadaPublica(cursada, editable);
  }

  async updateCursada(id: number, data: CursadaUpdateData, currentUser: any) {
    this.esAdministrativo(currentUser);
    const current = await this.getCursadaById(id, currentUser);
    if (current.espacioCurricular && (
      data.materiaId !== undefined || data.anioLectivo !== undefined || data.periodo !== undefined || data.activo === false
    )) {
      throw new AppError(409, 'La identidad y estado de una materia dentro de una cursada de espacio se administran desde la oferta completa');
    }
    if (data.materiaId !== undefined && data.materiaId !== current.materiaId) {
      await this.validarMateriaNoEsComponenteDeEspacio(data.materiaId);
    }
    await this.validarDatos(data, id);
    return await cursadaRepository.update(id, data);
  }

  async deleteCursada(id: number, currentUser: any) {
    this.esAdministrativo(currentUser);
    const current = await this.getCursadaById(id, currentUser);
    if (current.espacioCurricular) throw new AppError(409, 'No se puede dar de baja un componente por separado; administrá la cursada del espacio');
    return await cursadaRepository.delete(id);
  }

  async getInscriptosByCursada(cursadaId: number, currentUser: any): Promise<InscriptoPublico[]> {
    const cursada = await this.getCursadaById(cursadaId, currentUser);
    return await cursadaRepository.findInscriptosByCursadaId(
      cursadaId,
      cursada.estadoCursada === 'FINALIZADA'
    );
  }
}

export default new CursadaService();
