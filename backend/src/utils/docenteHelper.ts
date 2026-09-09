import cursadaRepository from '../repositories/cursadaRepository.js';
import profesorMateriaRepository from '../repositories/profesorMateriaRepository.js';
import { AppError } from '../utils/AppError.js';
import { ROLES } from '../constants/roles.js';
import { anioInstitucionalActual } from './cicloLectivo.js';

interface CursadaParaMutacion {
  materiaId: number;
  docenteId?: number | null;
  activo: boolean;
  anioLectivo: number;
  materia?: {
    profesorMaterias?: Array<{
      profesorId: number;
      activo: boolean;
      fechaBaja: Date | null;
    }>;
  };
}

/**
 * Una materia/cursada pertenece al profesor si tiene una asignación activa
 * vigente o si existe una cursada cuyo docenteId es el profesor.
 */
export async function tieneAsignacionActivaAMateria(profesorId: number, materiaId: number): Promise<boolean> {
  const asignacion = await profesorMateriaRepository.findByProfesorAndMateria(profesorId, materiaId);
  return asignacion !== null && asignacion.activo && !asignacion.fechaBaja;
}

export async function esProfesorAsignadoAMateria(profesorId: number, materiaId: number): Promise<boolean> {
  if (await tieneAsignacionActivaAMateria(profesorId, materiaId)) return true;

  const cursadas = await cursadaRepository.findByDocenteAndMateria(materiaId, profesorId);
  return cursadas.length > 0;
}

export async function verificarPermisoMateria(currentUser: any, materiaId: number): Promise<void> {
  if (currentUser.rol === ROLES.ADMINISTRATIVO) return;
  if (currentUser.rol !== ROLES.PROFESOR || !(await esProfesorAsignadoAMateria(currentUser.id, materiaId))) {
    throw new AppError(403, 'No tienes permisos para acceder a esta materia');
  }
}

/**
 * Verifica que el usuario pueda gestionar la cursada:
 * - ADMINISTRATIVO: siempre.
 * - PROFESOR: solo si es docente de la cursada o está asignado
 *   a la materia (profesores_materias).
 * Lanza AppError(403) si no tiene permiso, 404 si la cursada no existe.
 */
export async function verificarPermisoCursada(currentUser: any, cursadaId: number): Promise<void> {
  if (currentUser.rol === ROLES.ADMINISTRATIVO) return;

  if (currentUser.rol !== ROLES.PROFESOR) {
    throw new AppError(403, 'No tienes permisos para gestionar esta cursada');
  }

  const cursada = await cursadaRepository.findById(cursadaId);
  if (!cursada) {
    throw new AppError(404, 'Cursada no encontrada');
  }

  const esDocenteDeCursada = cursada.docenteId === currentUser.id;
  const estaAsignado = esDocenteDeCursada || await tieneAsignacionActivaAMateria(currentUser.id, cursada.materiaId);

  if (!esDocenteDeCursada && !estaAsignado) {
    throw new AppError(403, 'Solo el docente de la materia puede realizar esta acción');
  }
}

function tieneAsignacionEnCursada(currentUser: any, cursada: CursadaParaMutacion): boolean {
  return cursada.docenteId === currentUser.id || Boolean(
    cursada.materia?.profesorMaterias?.some(asignacion =>
      asignacion.profesorId === currentUser.id &&
      asignacion.activo &&
      !asignacion.fechaBaja
    )
  );
}

export function puedeMutarCursada(
  currentUser: any,
  cursada: CursadaParaMutacion,
  evaluadoEn: Date = new Date()
): boolean {
  if (currentUser.rol === ROLES.ADMINISTRATIVO) return true;
  if (currentUser.rol !== ROLES.PROFESOR) return false;
  return cursada.activo &&
    cursada.anioLectivo === anioInstitucionalActual(evaluadoEn) &&
    tieneAsignacionEnCursada(currentUser, cursada);
}

export async function verificarPermisoMutacionCursada(
  currentUser: any,
  cursadaId: number,
  evaluadoEn: Date = new Date()
): Promise<void> {
  if (currentUser.rol === ROLES.ADMINISTRATIVO) return;
  if (currentUser.rol !== ROLES.PROFESOR) {
    throw new AppError(403, 'No tienes permisos para modificar esta cursada');
  }

  const cursada = await cursadaRepository.findById(cursadaId) as CursadaParaMutacion | null;
  if (!cursada) {
    throw new AppError(404, 'Cursada no encontrada');
  }

  if (!cursada.activo || cursada.anioLectivo !== anioInstitucionalActual(evaluadoEn)) {
    throw new AppError(403, 'Los profesores solo pueden modificar cursadas activas del año institucional');
  }

  const asignadoDirectamente = cursada.docenteId === currentUser.id;
  const asignadoEnMateria = cursada.materia?.profesorMaterias
    ? tieneAsignacionEnCursada(currentUser, cursada)
    : await tieneAsignacionActivaAMateria(currentUser.id, cursada.materiaId);

  if (!asignadoDirectamente && !asignadoEnMateria) {
    throw new AppError(403, 'Solo el docente asignado puede modificar esta cursada');
  }
}
