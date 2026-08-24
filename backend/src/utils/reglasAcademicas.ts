/**
 * Reglas académicas oficiales del ISFD N°9133 según el
 * Reglamento Académico Institucional (RAI) y el RAM (Dec. 4199/15).
 */

// Art. 28 RAI: hasta el 50% de asistencia cuando todas las ausencias
// están justificadas (salud, trabajo, situaciones excepcionales)
export const MINIMO_CON_JUSTIFICACION = 50;

// Art. 32 RAI: la regularidad vale 3 años consecutivos a partir del primer
// turno del año lectivo siguiente al de la cursada ≈ vigente hasta el 31/12
// del año de cursada + 3
export const ANIOS_VALIDEZ_REGULARIDAD = 3;

// Art. 37d RAI: nota mínima de la instancia final integradora para
// acceder a la promoción directa
export const NOTA_MINIMA_INTEGRADORA = 8;

/**
 * Umbral de asistencia aplicable según modalidad de la materia:
 * - Semipresencial: 40% cada cuatrimestre (Art. 29)
 * - Presencial: materia.asistenciaRequerida, default 75% (Art. 28)
 */
export function umbralAsistencia(materia: {
  modalidad?: string | null;
  asistenciaRequerida?: number | null;
}): number {
  if (materia.modalidad === 'SEMIPRESENCIAL') {
    return 40;
  }
  return materia.asistenciaRequerida ?? 75;
}

// Art. 28 + tabla institucional: la flexión al 50% NO aplica a los
// Talleres de Práctica (por debajo de 75% no se contemplan razones
// de salud/laboral)
export function permiteFlexionJustificadas(materia: {
  tipoEspacio?: string | null;
}): boolean {
  return materia.tipoEspacio !== 'TALLER_PRACTICA';
}

// Tabla institucional Dimension Pedagogica:
// - materia presencial sin promocion directa: 75%
// - promocion directa, semipresencial, seminarios y talleres: 100%
export function umbralTpsRegularizar(materia: {
  tipoEspacio?: string | null;
  modalidad?: string | null;
  regimen?: string | null;
  esPromocionable?: boolean | null;
  tpRequeridos?: number | null;
}): number {
  const requiereTotalidad =
    materia.modalidad === 'SEMIPRESENCIAL' ||
    materia.regimen === 'REGULAR_SEMIPRESENCIAL' ||
    materia.regimen === 'REGULAR_PRESENCIAL_PROMOCION' ||
    materia.esPromocionable === true ||
    materia.tipoEspacio === 'SEMINARIO' ||
    materia.tipoEspacio === 'TALLER' ||
    materia.tipoEspacio === 'TALLER_PRACTICA';

  return requiereTotalidad ? 100 : 75;
}

// Art. 37b RAI + tabla: para PROMOCIÓN DIRECTA se exige el 100%
// de los trabajos prácticos entregados y aprobados
export const TPS_PARA_PROMOCION = 100;

// Art. 32 RAI / resoluciones: años de validez de la regularidad.
// Si la materia no tiene valor configurado: seminarios y talleres
// prácticos valen 1 año; el resto 3.
export function aniosValidezRegularidad(materia: {
  tipoEspacio?: string | null;
  aniosRegularidad?: number | null;
}): number {
  if (materia.aniosRegularidad) return materia.aniosRegularidad;
  const tipo = materia.tipoEspacio ?? '';
  return tipo === 'SEMINARIO' || tipo === 'TALLER' || tipo === 'TALLER_PRACTICA' ? 1 : 3;
}
