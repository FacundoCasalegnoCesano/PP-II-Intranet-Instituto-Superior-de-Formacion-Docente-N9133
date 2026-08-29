import examenRepository from '../repositories/examenRepository.js';
import materiaRepository from '../repositories/materiaRepository.js';
import userRepository from '../repositories/userRepository.js';
import inscripcionMateriaRepository from '../repositories/inscripcionMateriaRepository.js';
import type { ExamenCreateData, ExamenUpdateData, TribunalCreateData } from '../repositories/examenRepository.js';
import { getAlumnoIdByUsuarioId } from '../utils/alumnoHelper.js';
import { ROLES } from '../constants/roles.js';
import estadoAcademicoService from './estadoAcademicoService.js';
import { evaluarCorrelatividades } from '../domain/academico/correlatividades.js';
import { AppError } from '../utils/AppError.js';

type CurrentUser = {
  id: number;
  rol: string;
};

interface MesaDisponibleAlumno {
  id: number;
  materia: {
    id: number;
    nombre: string;
    carrera: {
      id: number;
      nombre: string;
    };
  };
  fecha: Date;
  tipoExamen: string;
  llamado: number;
  tribunal: Array<{
    profesorId: number;
    apellidoNombre: string;
    rolTribunal: string;
  }>;
  condicion: 'REGULAR' | 'LIBRE';
  inscripto: boolean;
}

class ExamenService {
  // ===== EXÁMENES =====
  async createExamen(data: ExamenCreateData, currentUser: any) {
    // Solo admin puede crear exámenes (RFGE8)
    if (currentUser.rol !== ROLES.ADMINISTRATIVO) {
      throw new Error('Solo administrativos pueden crear exámenes');
    }

    // Verificar que la materia existe
    const materia = await materiaRepository.findById(data.materiaId);
    if (!materia) {
      throw new Error('Materia no encontrada');
    }

    return await examenRepository.createExamen(data);
  }

  async getExamenById(id: number, currentUser?: CurrentUser) {
    const examen = await examenRepository.findExamenById(
      id,
      currentUser?.rol === ROLES.PROFESOR ? currentUser.id : undefined
    );
    if (!examen) {
      throw new AppError(404, 'Examen no encontrado');
    }
    if (currentUser?.rol === ROLES.PROFESOR && !examen.tribunales?.some((tribunal: any) => tribunal.profesorId === currentUser.id)) {
      throw new AppError(404, 'Mesa de examen no disponible');
    }
    return examen;
  }

  async listExamenes(filters: any, currentUser?: CurrentUser) {
    if (currentUser?.rol === ROLES.PROFESOR) {
      return await examenRepository.findAllExamenes({ ...filters, profesorId: currentUser.id });
    }
    if (currentUser && currentUser.rol !== ROLES.ADMINISTRATIVO) {
      throw new AppError(403, 'No tienes permisos para listar mesas');
    }
    return await examenRepository.findAllExamenes(filters);
  }

  async getMesasDisponibles(
    currentUser: CurrentUser,
    evaluadoEn = new Date()
  ): Promise<MesaDisponibleAlumno[]> {
    if (currentUser.rol !== ROLES.ALUMNO) {
      throw new Error('Solo alumnos pueden consultar mesas disponibles');
    }

    const idAlumno = await getAlumnoIdByUsuarioId(currentUser.id);
    const fechaDesde = this.inicioDelDia(evaluadoEn);
    fechaDesde.setDate(fechaDesde.getDate() + 1);

    const mesas = await examenRepository.findMesasDisponiblesParaAlumno({
      usuarioId: currentUser.id,
      alumnoId: idAlumno,
      cicloLectivo: evaluadoEn.getFullYear(),
      evaluadoEn,
      fechaDesde
    });
    if (mesas.length === 0) return [];

    const materiaIds = [...new Set(mesas.map(mesa => mesa.materiaId))];
    const [regularidadesVigentes, materiasAprobadas] = await Promise.all([
      estadoAcademicoService.getRegularidadesVigentesSet(
        idAlumno,
        materiaIds,
        evaluadoEn
      ),
      estadoAcademicoService.getMateriasAprobadasSet(idAlumno)
    ]);

    return mesas.flatMap<MesaDisponibleAlumno>(mesa => {
      const correlatividades = evaluarCorrelatividades({
        modo: 'RENDIR',
        correlatividades: mesa.materia.correlatividadesOrigen,
        materiasCumplidas: materiasAprobadas
      });
      if (!correlatividades.cumple) return [];

      const condicion = regularidadesVigentes.has(mesa.materiaId)
        ? 'REGULAR'
        : mesa.materia.inscripciones.length > 0
          ? 'LIBRE'
          : null;
      if (condicion === null) return [];

      return [{
        id: mesa.id,
        materia: {
          id: mesa.materia.id,
          nombre: mesa.materia.nombre,
          carrera: mesa.materia.carrera
        },
        fecha: mesa.fecha,
        tipoExamen: mesa.tipoExamen,
        llamado: mesa.llamado,
        tribunal: mesa.tribunales.map(tribunal => ({
          profesorId: tribunal.profesorId,
          apellidoNombre: tribunal.profesor.apellidoNombre,
          rolTribunal: tribunal.rolTribunal
        })),
        condicion,
        inscripto: mesa.inscripciones.some(inscripcion => inscripcion.fechaBaja === null)
      }];
    });
  }

  async updateExamen(id: number, data: ExamenUpdateData, currentUser: any) {
    if (currentUser.rol !== ROLES.ADMINISTRATIVO) {
      throw new Error('Solo administrativos pueden actualizar exámenes');
    }

    const examen = await examenRepository.findExamenById(id);
    if (!examen) {
      throw new Error('Examen no encontrado');
    }

    return await examenRepository.updateExamen(id, data);
  }

  async deleteExamen(id: number, currentUser: any) {
    if (currentUser.rol !== ROLES.ADMINISTRATIVO) {
      throw new Error('Solo administrativos pueden eliminar exámenes');
    }

    const examen = await examenRepository.findExamenById(id);
    if (!examen) {
      throw new Error('Examen no encontrado');
    }

    return await examenRepository.deleteExamen(id);
  }

  // ===== TRIBUNALES =====
  async addTribunal(data: TribunalCreateData, currentUser: any) {
    if (currentUser.rol !== ROLES.ADMINISTRATIVO) {
      throw new Error('Solo administrativos pueden asignar tribunales');
    }

    // Verificar que el examen existe
    const examen = await examenRepository.findExamenById(data.mesaId);
    if (!examen) {
      throw new Error('Examen no encontrado');
    }

    // Verificar que el profesor existe
    const profesor = await userRepository.findById(data.profesorId);
    const rolesProfesor = (profesor?.rol ?? '').split(',').map((rol: string) => rol.trim());
    if (!profesor || !rolesProfesor.includes(ROLES.PROFESOR)) {
      throw new Error('Profesor no encontrado o no es profesor');
    }

    return await examenRepository.addTribunal(data);
  }

  async removeTribunal(id: number, currentUser: any) {
    if (currentUser.rol !== ROLES.ADMINISTRATIVO) {
      throw new Error('Solo administrativos pueden eliminar tribunales');
    }

    return await examenRepository.removeTribunal(id);
  }

  // ===== INSCRIPCIÓN A EXÁMENES =====
  async inscribirAlumno(examenId: number, alumnoId: number, condicion: string, currentUser: any) {
    // `alumnoId` es el id de cuenta (Usuario.idUsuario). InscripcionExamen guarda idAlumno.
    const alumno = await userRepository.findById(alumnoId);
    const rolesAlumno = (alumno?.rol ?? '').split(',').map((rol: string) => rol.trim());
    if (!alumno || !rolesAlumno.includes(ROLES.ALUMNO)) {
      throw new Error('Alumno no encontrado');
    }

    // Si es alumno, solo puede inscribirse a sí mismo
    if (currentUser.rol === ROLES.ALUMNO && currentUser.id !== alumnoId) {
      throw new Error('No puedes inscribir a otro alumno');
    }

    const idAlumno = await getAlumnoIdByUsuarioId(alumnoId);

    // Si es admin, puede inscribir a cualquier alumno

    // Verificar que el examen existe
    const examen = await examenRepository.findExamenById(examenId);
    if (!examen) {
      throw new Error('Examen no encontrado');
    }

    // Verificar la condición académica declarada para rendir (RFGE9).
    if (condicion === 'REGULAR') {
      const regularidadVigente = await estadoAcademicoService.tieneRegularidadVigente(
        idAlumno,
        examen.materiaId
      );
      if (!regularidadVigente) {
        throw new Error('El alumno no tiene regularidad vigente en esta materia');
      }
    } else {
      // Conserva el comportamiento previo para inscripciones en condición LIBRE.
      const inscripcionMateria = await inscripcionMateriaRepository.findByAlumnoAndMateria(
        idAlumno,
        examen.materiaId,
        new Date().getFullYear()
      );
      if (!inscripcionMateria) {
        throw new Error('El alumno no está inscripto en esta materia');
      }
    }

    // Verificar correlatividades (RFGE9)
    await this.verificarCorrelatividadesParaExamen(idAlumno, examen.materiaId);

    // Corte por día de mesa y habilitación explícita en período EXAMEN:
    // desde las 00:00 del día de la mesa no se permite inscribirse. El
    // administrativo puede inscribir fuera de período (casos especiales).
    if (currentUser.rol === ROLES.ALUMNO) {
      const { default: periodoInscripcionService } = await import('./periodoInscripcionService.js');
      const habilitada = await periodoInscripcionService.mesaHabilitada(examenId);
      if (!habilitada) {
        throw new Error('Esta mesa de examen no está habilitada para inscripción');
      }
      const inicioDiaMesa = this.inicioDelDia(new Date(examen.fecha));
      if (new Date() >= inicioDiaMesa) {
        throw new Error('La inscripción a esta mesa cerró: es el día del examen');
      }
    }

    // La baja de examen es lógica (fechaBaja) y la unique (mesaId, alumnoId)
    // incluye registros dados de baja: si existe uno, se reactiva en lugar de crear
    const previa = await examenRepository.findInscripcionByMesaAndAlumno(examenId, idAlumno);
    if (previa && !previa.fechaBaja) {
      throw new Error('El alumno ya está inscripto a este examen');
    }
    if (previa) {
      return await examenRepository.reactivarInscripcion(previa.id, condicion);
    }

    return await examenRepository.inscribirAlumno(examenId, idAlumno, condicion);
  }

  async verificarCorrelatividadesParaExamen(idAlumno: number, materiaId: number) {
    // Obtener correlatividades que aplican para rendir (aplicaRendir = true)
    const correlatividades = await materiaRepository.getCorrelatividades(materiaId);
    if (correlatividades.length === 0) {
      return;
    }

    // Obtener materias aprobadas del alumno con la derivación RAI completa
    // (examen final ante tribunal, homologación, promoción Art. 37d)
    const materiasAprobadas = await estadoAcademicoService.getMateriasAprobadasSet(idAlumno);

    const resultado = evaluarCorrelatividades({
      modo: 'RENDIR',
      correlatividades,
      materiasCumplidas: materiasAprobadas
    });

    if (!resultado.cumple && resultado.primerError.tipo === 'OBLIGATORIA_NO_CUMPLIDA') {
      throw new Error(`Falta correlatividad obligatoria para rendir: ${resultado.primerError.nombreMateria}`);
    }
  }

  async desinscribirAlumno(examenId: number, alumnoId: number, currentUser: any) {
    // Si es alumno, solo puede desinscribirse a sí mismo
    if (currentUser.rol === ROLES.ALUMNO && currentUser.id !== alumnoId) {
      throw new Error('No puedes desinscribir a otro alumno');
    }

    const idAlumno = await getAlumnoIdByUsuarioId(alumnoId);

    // Verificar que el examen existe
    const examen = await examenRepository.findExamenById(examenId);
    if (!examen) {
      throw new Error('Examen no encontrado');
    }

    // Corte mismo-día (decisión institucional): desde las 00:00 del día de la
    // mesa no se permite darse de baja. Reemplaza la regla previa de 24 horas.
    const inicioDiaMesa = this.inicioDelDia(new Date(examen.fecha));
    if (new Date() >= inicioDiaMesa) {
      throw new Error('No puedes darte de baja el mismo día del examen');
    }

    return await examenRepository.desinscribirAlumno(examenId, idAlumno);
  }

  private inicioDelDia(fecha: Date): Date {
    const d = new Date(fecha);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  async getInscriptosByExamen(examenId: number, currentUser?: CurrentUser) {
    await this.getExamenById(examenId, currentUser);
    return await examenRepository.getInscriptosByExamen(examenId);
  }

  async getInscripcionesByAlumno(alumnoId: number, currentUser: any) {
    if (currentUser.rol === ROLES.PROFESOR) {
      throw new AppError(403, 'Los profesores no pueden consultar inscripciones globales a exámenes');
    }
    if (currentUser.rol !== ROLES.ADMINISTRATIVO && currentUser.id !== alumnoId) {
      throw new Error('No tienes permisos para ver estas inscripciones');
    }

    // `alumnoId` es el id de cuenta (Usuario.idUsuario)
    const idAlumno = await getAlumnoIdByUsuarioId(alumnoId);
    return await examenRepository.getInscripcionesByAlumno(idAlumno);
  }

  // ===== CALIFICACIONES =====
  async registrarNota(examenId: number, alumnoId: number, nota: number, currentUser: any) {
    // Solo admin o profesor pueden registrar notas
    if (currentUser.rol !== ROLES.ADMINISTRATIVO && currentUser.rol !== ROLES.PROFESOR) {
      throw new Error('Solo administrativos o profesores pueden registrar notas');
    }

    const examen = await examenRepository.findExamenById(examenId);
    if (!examen) {
      throw new AppError(404, 'Examen no encontrado');
    }
    if (currentUser.rol === ROLES.PROFESOR && !examen.tribunales?.some((tribunal: any) => tribunal.profesorId === currentUser.id)) {
      throw new AppError(403, 'Solo integrantes del tribunal pueden registrar la calificación');
    }

    // Verificar que el examen existe y la materia tiene nota mínima
    const materia = await materiaRepository.findById(examen.materiaId);
    const notaMinima = materia?.notaMinima || 6;

    if (nota < notaMinima) {
      throw new Error(`La nota mínima para este examen es ${notaMinima}`);
    }

    // `alumnoId` es el id de cuenta (Usuario.idUsuario)
    const idAlumno = await getAlumnoIdByUsuarioId(alumnoId);
    return await examenRepository.registrarNota(examenId, idAlumno, nota);
  }
}

export default new ExamenService();
