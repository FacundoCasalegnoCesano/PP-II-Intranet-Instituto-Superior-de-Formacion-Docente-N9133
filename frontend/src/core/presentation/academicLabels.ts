export type AcademicLabelContext = 'GENERAL' | 'CURSADA' | 'MESA'

const ACADEMIC_LABELS: Record<string, string> = {
  MATERIA: 'Materia',
  SEMINARIO: 'Seminario',
  TALLER: 'Taller',
  TALLER_PRACTICA: 'Taller de Práctica',
  PRESENCIAL: 'Presencial',
  SEMIPRESENCIAL: 'Semipresencial',
  LIBRE: 'Libre',
  ANUAL: 'Anual',
  PRIMER_CUATRIMESTRE: 'Primer cuatrimestre',
  SEGUNDO_CUATRIMESTRE: 'Segundo cuatrimestre',
  REGULAR_PRESENCIAL_PROMOCION: 'Regular presencial con promoción',
  REGULAR_PRESENCIAL_SIN_PROMOCION: 'Regular presencial sin promoción',
  REGULAR_SEMIPRESENCIAL: 'Regular semipresencial',
  OBLIGATORIA: 'Obligatoria',
  ALTERNATIVA: 'Alternativa',
  GRUPO: 'Grupo',
  ACTIVA: 'Activa',
  INACTIVA: 'Inactiva',
  BAJA: 'Baja',
  FINALIZADA: 'Finalizada',
  RECURSANDO: 'Recursando',
  EN_CURSO: 'En curso',
  REGULAR: 'Regular',
  HABILITADO_PROMOCION: 'Habilitado para promoción',
  PROMOCIONADO: 'Promocionado',
  APROBADO: 'Aprobado',
  APROBADA: 'Aprobada',
  PARCIAL: 'Parcial',
  RECUPERATORIO: 'Recuperatorio',
  COLOQUIO: 'Coloquio',
  EXAMEN_FINAL: 'Examen final',
  TRABAJO_PRACTICO: 'Trabajo práctico',
  PROMOCION: 'Promoción',
  PROMOCION_DIRECTA: 'Promoción directa',
  ORAL: 'Oral',
  ESCRITO: 'Escrito',
  PRESIDENTE: 'Presidente',
  VOCAL: 'Vocal',
  SUPLENTE: 'Suplente',
  ABIERTA: 'Abierta',
  EN_PROCESO: 'En proceso',
  TOTAL: 'Total',
  PENDIENTE: 'Pendiente',
  RECHAZADA: 'Rechazada',
  HOMOLOGACION: 'Homologación',
  MESA: 'Mesa',
  EXAMEN: 'Examen',
}

const ROLE_LABELS: Record<string, string> = {
  ALUMNO: 'Alumno/a',
  PROFESOR: 'Profesor/a',
  ADMINISTRATIVO: 'Administrativo/a',
}

function sentenceCase(value: string): string {
  const words = value.toLowerCase().split('_')
  return words.map((word, index) => index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word).join(' ')
}

// Reserved for future labels that vary by screen context; current variants live in gradeTypeLabel.
export function academicLabel(value?: string | null, _context: AcademicLabelContext = 'GENERAL'): string {
  if (!value) return '—'
  return ACADEMIC_LABELS[value] ?? sentenceCase(value)
}

export function roleLabel(value?: string | null): string {
  if (!value) return '—'
  return ROLE_LABELS[value] ?? academicLabel(value)
}

export function gradeTypeLabel(value?: string | null, context: AcademicLabelContext = 'GENERAL'): string {
  if (value === 'EXAMEN_FINAL' && context === 'CURSADA') return 'Instancia integradora'
  return academicLabel(value, context)
}

export function formatAcademicDate(value?: string | Date | null): string {
  if (!value) return 'Sin fecha informada'
  let date: Date
  if (value instanceof Date) {
    date = new Date(value.getTime())
  } else {
    const calendarPrefix = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
    date = calendarPrefix
      ? new Date(Number(calendarPrefix[1]), Number(calendarPrefix[2]) - 1, Number(calendarPrefix[3]))
      : new Date(value)
  }
  if (Number.isNaN(date.getTime())) return 'Fecha inválida'
  return date.toLocaleDateString('es-AR')
}
