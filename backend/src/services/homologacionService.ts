import homologacionRepository from '../repositories/homologacionRepository.js';
import materiaRepository from '../repositories/materiaRepository.js';
import alumnoRepository from '../repositories/alumnoRepository.js';
import type { HomologacionCreateData, HomologacionUpdateData } from '../repositories/homologacionRepository.js';
import { ROLES } from '../constants/roles.js';
import { getAlumnoIdByUsuarioId } from '../utils/alumnoHelper.js';
import userRepository from '../repositories/userRepository.js';

class HomologacionService {
  // ===== CREAR SOLICITUD (Admin) =====
  async crearSolicitud(data: HomologacionCreateData, currentUser: any): Promise<any> {
    if (currentUser.rol !== ROLES.ADMINISTRATIVO) {
      throw new Error('Solo administrativos pueden crear solicitudes de homologación');
    }

    // Validar alumno existe y es alumno (data.alumnoId = idUsuario, igual que en inscripciones)
    const cuenta = await userRepository.findById(data.alumnoId);
    if (!cuenta || cuenta.rol !== ROLES.ALUMNO) {
      throw new Error('El alumno no existe o no es un alumno');
    }
    const idAlumno = await getAlumnoIdByUsuarioId(data.alumnoId);

    // Validar materia existe
    const materia = await materiaRepository.findById(data.materiaId);
    if (!materia) {
      throw new Error('La materia no existe');
    }

    // Validar nota: enteros 0-10
    if (!Number.isInteger(data.calificacion) || data.calificacion < 0 || data.calificacion > 10) {
      throw new Error('La calificación debe ser un número entero entre 0 y 10');
    }

    // Verificar que no exista ya una homologación para este alumno/materia
    const existente = await prisma.homologacion.findUnique({
      where: {
        alumnoId_materiaId: { alumnoId: idAlumno, materiaId: data.materiaId }
      }
    });
    if (existente) {
      throw new Error('Ya existe una solicitud de homologación para este alumno y materia');
    }

    return await homologacionRepository.create({ ...data, alumnoId: idAlumno });
  }

  // ===== MIS SOLICITUDES (Alumno) =====
  async getMisSolicitudes(alumnoUsuarioId: number): Promise<any[]> {
    const alumno = await alumnoRepository.findByUsuarioId(alumnoUsuarioId);
    if (!alumno) {
      throw new Error('Alumno no encontrado');
    }
    return await homologacionRepository.findByAlumno(alumno.idAlumno);
  }

  // ===== LISTAR CON FILTROS (Admin) =====
  async listar(filters: { estado?: string; alumnoId?: number; page?: number; limit?: number } = {}) {
    return await homologacionRepository.findAll(filters);
  }

  // ===== CARGAR NOTA DEL COMPLEMENTARIO (Admin) =====
  async cargarNotaComplementaria(id: number, notaExamenHomologacion: number): Promise<any> {
    const homologacion = await this.getById(id);
    if (!homologacion) {
      throw new Error('Solicitud no encontrada');
    }

    if (homologacion.tipoHomologacion !== 'PARCIAL') {
      throw new Error('Solo las homologaciones parciales requieren nota de examen complementario');
    }

    const materia = await materiaRepository.findById(homologacion.materiaId);
    if (!materia) {
      throw new Error('Materia asociada no encontrada');
    }

    const notaMinima = materia.notaMinima ?? 6;
    if (!Number.isInteger(notaExamenHomologacion) || notaExamenHomologacion < 0 || notaExamenHomologacion > 10) {
      throw new Error('La nota del examen complementario debe ser un número entero entre 0 y 10');
    }

    if (notaExamenHomologacion < (materia.notaMinima ?? 6)) {
      throw new Error(`La nota del complementario debe ser mayor o igual a ${notaMinima} (nota mínima de la materia)`);
    }

    return await homologacionRepository.update(id, {
      notaExamenHomologacion,
      observacion: 'Nota de examen complementario registrada'
    });
  }

  // ===== RESOLVER (APROBAR/RECHAZAR) (Admin) =====
  async resolver(id: number, accion: 'APROBAR' | 'RECHAZAR', notaExamenHomologacion?: number): Promise<any> {
    const homologacion = await this.getById(id);
    if (!homologacion) {
      throw new Error('Solicitud no encontrada');
    }

    if (homologacion.estado !== 'PENDIENTE') {
      throw new Error('Solo se pueden resolver solicitudes en estado PENDIENTE');
    }

    if (accion === 'RECHAZAR') {
      return await homologacionRepository.update(id, { estado: 'RECHAZADA' });
    }

    // APROBAR
    if (homologacion.tipoHomologacion === 'PARCIAL') {
      // Para parcial, exigir nota del complementario cargada y >= notaMinima
      if (homologacion.notaExamenHomologacion === null || homologacion.notaExamenHomologacion === undefined) {
        throw new Error('Para aprobar una homologación parcial, primero debe cargar la nota del examen complementario');
      }
      const materia = await materiaRepository.findById(homologacion.materiaId);
      if (!materia) {
        throw new Error('Materia no encontrada');
      }
      if (homologacion.notaExamenHomologacion < (materia.notaMinima ?? 6)) {
        throw new Error(`La nota del examen complementario (${homologacion.notaExamenHomologacion}) debe ser >= ${materia.notaMinima ?? 6}`);
      }
    }

    // TOTAL: no requiere nota complementaria, se aprueba directo con la calificación original
    return await homologacionRepository.update(id, {
      estado: 'APROBADA'
    });
  }

  private async getById(id: number): Promise<any> {
    return await homologacionRepository.findById(id);
  }
}

// Import prisma for direct queries
import { prisma } from '../config/prisma.js';

export default new HomologacionService();
