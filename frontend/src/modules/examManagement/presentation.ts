import { academicLabel, formatAcademicDate, roleLabel } from '@/core/presentation/academicLabels'

export const INSTITUTIONAL_TIME_ZONE = 'America/Argentina/Buenos_Aires'

export function examDateLabel(value: string | null | undefined): string {
  if (!value) return 'Sin fecha informada'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Fecha inválida'
  return date.toLocaleString('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: INSTITUTIONAL_TIME_ZONE,
  })
}

export function examDateInputValue(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: INSTITUTIONAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

export function toInstitutionalIso(value: string): string {
  if (!value) return value
  return `${value}:00-03:00`
}

export function statusLabel(value: string): string {
  return academicLabel(value)
}

export function resultLabel(value: string): string {
  return academicLabel(value)
}

export function tribunalRoleLabel(value: string): string {
  return roleLabel(value)
}

export { formatAcademicDate }
