import cursadaRepository from '../repositories/cursadaRepository.js';
import profesorMateriaRepository from '../repositories/profesorMateriaRepository.js';
import { AppError } from '../utils/AppError.js';
import { ROLES } from '../constants/roles.js';

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
