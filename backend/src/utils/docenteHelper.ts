import cursadaRepository from '../repositories/cursadaRepository.js';
import profesorMateriaRepository from '../repositories/profesorMateriaRepository.js';
import { AppError } from '../utils/AppError.js';
import { ROLES } from '../constants/roles.js';

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
  const asignacion = await profesorMateriaRepository.findByProfesorAndMateria(
    currentUser.id,
    cursada.materiaId
  );
  const estaAsignado = asignacion !== null && asignacion.activo && !asignacion.fechaBaja;

  if (!esDocenteDeCursada && !estaAsignado) {
    throw new AppError(403, 'Solo el docente de la materia puede realizar esta acción');
  }
}