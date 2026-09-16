import { formatAcademicDate } from '@/core/presentation/academicLabels'
import type { Homologation } from './types/homologations'

export const HOMOLOGATION_LIST_PATH = '/app/administracion/homologaciones'

export type HomologationStateTone = 'warning' | 'success' | 'danger'

export interface HomologationStateInfo {
  officialLabel: string
  operationalLabel: string | null
  label: string
  tone: HomologationStateTone
}

function positiveId(value: string | null): number | undefined {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function normalizedStatus(value: string | null): 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | undefined {
  return value === 'PENDIENTE' || value === 'APROBADA' || value === 'RECHAZADA' ? value : undefined
}

function normalizedType(value: string | null): 'TOTAL' | 'PARCIAL' | undefined {
  return value === 'TOTAL' || value === 'PARCIAL' ? value : undefined
}

export function normalizeHomologationReturnTo(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  try {
    const target = new URL(value, 'https://intranet.local')
    if (target.origin !== 'https://intranet.local' || target.pathname !== HOMOLOGATION_LIST_PATH || target.hash) return null

    const params = new URLSearchParams()
    const search = target.searchParams.get('search')?.trim()
    const estado = normalizedStatus(target.searchParams.get('estado'))
    const tipo = normalizedType(target.searchParams.get('tipo'))
    const carreraId = positiveId(target.searchParams.get('carreraId'))
    const materiaId = positiveId(target.searchParams.get('materiaId'))
    const page = positiveId(target.searchParams.get('page'))
    if (search) params.set('search', search)
    if (estado) params.set('estado', estado)
    if (tipo) params.set('tipo', tipo)
    if (carreraId) params.set('carreraId', String(carreraId))
    if (materiaId) params.set('materiaId', String(materiaId))
    if (page && page > 1) params.set('page', String(page))
    const query = params.toString()
    return query ? `${HOMOLOGATION_LIST_PATH}?${query}` : HOMOLOGATION_LIST_PATH
  } catch {
    return null
  }
}

export function homologationReturnToQuery(value: unknown): Record<string, string> {
  const normalized = normalizeHomologationReturnTo(value)
  if (!normalized) return {}
  return Object.fromEntries(new URL(normalized, 'https://intranet.local').searchParams.entries())
}

export function homologationStateInfo(item: Homologation): HomologationStateInfo {
  const officialLabel = item.estado === 'PENDIENTE' ? 'Pendiente' : item.estado === 'APROBADA' ? 'Aprobada' : 'Rechazada'
  if (item.estado !== 'PENDIENTE') {
    return {
      officialLabel,
      operationalLabel: null,
      label: officialLabel,
      tone: item.estado === 'APROBADA' ? 'success' : 'danger',
    }
  }

  if (item.tipo === 'TOTAL') {
    return { officialLabel, operationalLabel: 'Pendiente de confirmación', label: 'Pendiente de confirmación', tone: 'warning' }
  }
  if (item.notaComplementaria === null) {
    return { officialLabel, operationalLabel: 'Pendiente de examen complementario', label: 'Pendiente de examen complementario', tone: 'warning' }
  }
  if (item.notaComplementaria < item.materia.notaMinima) {
    return { officialLabel, operationalLabel: 'Examen complementario desaprobado', label: 'Examen complementario desaprobado', tone: 'danger' }
  }
  return { officialLabel, operationalLabel: 'Lista para aprobar', label: 'Lista para aprobar', tone: 'success' }
}

export function homologationStateLabel(item: Homologation): string {
  return homologationStateInfo(item).label
}

export function homologationStateTone(item: Homologation): HomologationStateTone {
  return homologationStateInfo(item).tone
}

export function canApproveHomologation(item: Homologation): boolean {
  if (item.estado !== 'PENDIENTE') return false
  if (item.tipo === 'TOTAL') return true
  return item.notaComplementaria !== null && item.notaComplementaria >= item.materia.notaMinima
}

export function formatHomologationDate(value: string | Date | null | undefined): string {
  return formatAcademicDate(value)
}
