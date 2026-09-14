import type { EnrollmentPeriod, PeriodStatus } from './types/admin'

const STATUS_LABELS: Record<PeriodStatus, string> = {
  DESACTIVADO: 'Desactivado',
  PROGRAMADO: 'Programado',
  ABIERTO: 'Abierto',
  FINALIZADO: 'Finalizado',
}

const dateFormatter = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
const dateOnlyFormatter = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  day: '2-digit', month: '2-digit', year: 'numeric',
})

export function calculatePeriodStatus(period: Pick<EnrollmentPeriod, 'activo' | 'fechaInicio' | 'fechaFin'>, now = new Date()): PeriodStatus {
  if (!period.activo) return 'DESACTIVADO'
  if (now.getTime() < new Date(period.fechaInicio).getTime()) return 'PROGRAMADO'
  if (now.getTime() <= new Date(period.fechaFin).getTime()) return 'ABIERTO'
  return 'FINALIZADO'
}

export function periodStatusLabel(status: PeriodStatus): string {
  return STATUS_LABELS[status]
}

export function periodTitle(period: Pick<EnrollmentPeriod, 'tipo' | 'cicloLectivo'>): string {
  return `Inscripción a ${period.tipo === 'EXAMEN' ? 'exámenes' : 'materias'} · Ciclo ${period.cicloLectivo}`
}

export function formatPeriodDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Fecha inválida' : dateFormatter.format(date)
}

export function formatArgentinaDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Fecha inválida' : dateOnlyFormatter.format(date)
}

export function periodDateRange(period: Pick<EnrollmentPeriod, 'fechaInicio' | 'fechaFin'>): string {
  return `Del ${formatPeriodDate(period.fechaInicio)} al ${formatPeriodDate(period.fechaFin)}`
}

export function periodScope(period: Pick<EnrollmentPeriod, 'tipo' | 'cantidadMaterias' | 'cantidadMesas'>): string {
  const count = period.tipo === 'EXAMEN' ? period.cantidadMesas : period.cantidadMaterias
  return `${count} ${period.tipo === 'EXAMEN' ? 'mesas' : 'materias'} habilitadas`
}

export function toArgentinaIso(value: string, endOfDay = false): string {
  const normalized = value.length === 10 ? `${value}T${endOfDay ? '23:59' : '00:00'}` : value
  return new Date(`${normalized}:00-03:00`).toISOString()
}

export function toArgentinaDateTimeLocal(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(date).reduce<Record<string, string>>((result, part) => ({ ...result, [part.type]: part.value }), {})
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}
