import { apiClient } from '@/core/api/client'
import type { PaginatedResult } from '@/core/api/contracts'
import { adminApi } from '@/modules/admin/api/adminApi'
import type { Career } from '@/modules/admin/types/admin'
import type {
  AdminAcademicCareerEnrollment,
  AdminAcademicRecordFilters,
  AdminAcademicStudent,
  AdminAcademicTrajectory,
} from '../types/adminAcademicRecords'

interface ApiReader {
  get<T>(path: string): Promise<T>
  getPaginated?<T>(path: string): Promise<PaginatedResult<T>>
}

function query(params: Record<string, unknown>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const result = search.toString()
  return result ? `?${result}` : ''
}

export function fetchAdminStudents(filters: AdminAcademicRecordFilters = {}, client: ApiReader = apiClient): Promise<PaginatedResult<AdminAcademicStudent>> {
  if (!client.getPaginated) throw new Error('El cliente no admite respuestas paginadas.')
  return client.getPaginated<AdminAcademicStudent>(`/alumnos${query({ ...filters, limit: filters.limit ?? 20 })}`)
}

export function fetchAdminStudent(userId: number, client: ApiReader = apiClient): Promise<AdminAcademicStudent> {
  return client.get<AdminAcademicStudent>(`/alumnos/${userId}`)
}

export function fetchAdminStudentCareers(userId: number, client: ApiReader = apiClient): Promise<AdminAcademicCareerEnrollment[]> {
  return client.get<AdminAcademicCareerEnrollment[]>(`/inscripciones-carreras/alumno/${userId}?includeInactive=true`)
}

export function fetchAdminStudentTrajectory(userId: number, careerId: number, client: ApiReader = apiClient): Promise<AdminAcademicTrajectory> {
  return client.get<AdminAcademicTrajectory>(`/estado-academico/alumno/${userId}/trayectoria?carreraId=${careerId}`)
}

function isCoherentPagination(result: PaginatedResult<Career>, page: number, total?: number, totalPages?: number): boolean {
  const { pagination } = result
  return pagination.page === page
    && pagination.limit === 20
    && Number.isInteger(pagination.total)
    && pagination.total >= 0
    && Number.isInteger(pagination.totalPages)
    && pagination.totalPages === (pagination.total === 0 ? 0 : Math.ceil(pagination.total / pagination.limit))
    && (total === undefined || pagination.total === total)
    && (totalPages === undefined || pagination.totalPages === totalPages)
}

/** Obtiene el catálogo completo para que el filtro también contemple carreras inactivas. */
export async function fetchAllAdminCareers(): Promise<Career[]> {
  const first = await adminApi.listCareers({ page: 1, limit: 20 })
  if (!isCoherentPagination(first, 1)) throw new Error('No pudimos cargar las carreras.')

  const careers = new Map<number, Career>()
  for (const career of first.data) careers.set(career.id, career)
  const { total, totalPages } = first.pagination
  for (let page = 2; page <= totalPages; page += 1) {
    const next = await adminApi.listCareers({ page, limit: 20 })
    if (!isCoherentPagination(next, page, total, totalPages)) throw new Error('No pudimos cargar las carreras.')
    for (const career of next.data) careers.set(career.id, career)
  }
  if (careers.size !== total) throw new Error('No pudimos cargar las carreras.')
  return [...careers.values()]
}
