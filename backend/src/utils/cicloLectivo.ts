const ZONA_HORARIA_INSTITUCIONAL = 'America/Argentina/Buenos_Aires';

export function anioInstitucionalActual(fecha: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_HORARIA_INSTITUCIONAL,
    year: 'numeric'
  }).format(fecha));
}

/**
 * Compara una fecha calendario persistida en UTC con el ciclo lectivo.
 * Los endpoints validan por separado el formato antes de llegar aquí.
 */
export function fechaPerteneceAlAnioLectivo(
  fecha: Date | string,
  anioLectivo: number
): boolean {
  const fechaNormalizada = fecha instanceof Date ? fecha : new Date(fecha);
  return !Number.isNaN(fechaNormalizada.getTime()) &&
    fechaNormalizada.getUTCFullYear() === anioLectivo;
}
