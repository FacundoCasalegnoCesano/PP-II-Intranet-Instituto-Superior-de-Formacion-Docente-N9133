import { apiClient } from '@/core/api/client'
import type { AcademicRecordCareer, AcademicRecordTrajectory } from '../types/academicRecord'
import type { AcademicRecordAttendance } from '../types/academicRecord'
import type { PaginatedResult } from '@/core/api/contracts'

interface ApiReader {
  get<T>(path: string): Promise<T>
  getPaginated<T>(path: string): Promise<PaginatedResult<T>>
}

export function fetchAcademicRecordAttendance(
  userId: number,
  options: { carreraId: number; cursadaId: number; page?: number; limit?: number },
  client: Pick<ApiReader, 'getPaginated'> = apiClient,
): Promise<PaginatedResult<AcademicRecordAttendance>> {
  const params = new URLSearchParams({
    carreraId: String(options.carreraId),
    cursadaId: String(options.cursadaId),
    page: String(options.page ?? 1),
    limit: String(options.limit ?? 20),
  })
  return client.getPaginated<AcademicRecordAttendance>(`/asistencias/alumno/${userId}?${params.toString()}`)
}

export function fetchAcademicRecordCareers(userId: number, client: Pick<ApiReader, 'get'> = apiClient): Promise<AcademicRecordCareer[]> {
  return client.get<AcademicRecordCareer[]>(`/inscripciones-carreras/alumno/${userId}`)
}

export function fetchAcademicRecordTrajectory(userId: number, careerId: number, client: Pick<ApiReader, 'get'> = apiClient): Promise<AcademicRecordTrajectory> {
  return client.get<AcademicRecordTrajectory>(`/estado-academico/alumno/${userId}/trayectoria?carreraId=${careerId}`)
}
