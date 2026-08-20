import alumnoRepository from '../repositories/alumnoRepository.js';

// Los endpoints reciben `alumnoId` como id de cuenta (Usuario.idUsuario).
// Las tablas que tienen FK a la tabla Alumno (InscripcionMateria,
// InscripcionExamen, Calificacion, etc.) guardan el idAlumno. Este helper
// resuelve un id de cuenta a su idAlumno correspondiente (1:1 via idCuenta).
export async function getAlumnoIdByUsuarioId(usuarioId: number): Promise<number> {
  const alumno = await alumnoRepository.findByUsuarioId(usuarioId);
  if (!alumno) {
    throw new Error('El usuario no tiene un registro de alumno asociado');
  }
  return alumno.idAlumno;
}