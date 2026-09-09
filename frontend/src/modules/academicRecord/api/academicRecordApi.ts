import { apiClient } from '@/core/api/client'
import type { AcademicRecordCareer, AcademicRecordTrajectory } from '../types/academicRecord'

interface ApiReader {
  get<T>(path: string): Promise<T>
}

export function fetchAcademicRecordCareers(userId: number, client: ApiReader = apiClient): Promise<AcademicRecordCareer[]> {
  return client.get<AcademicRecordCareer[]>(`/inscripciones-carreras/alumno/${userId}`)
}

export function fetchAcademicRecordTrajectory(userId: number, careerId: number, client: ApiReader = apiClient): Promise<AcademicRecordTrajectory> {
  return client.get<AcademicRecordTrajectory>(`/estado-academico/alumno/${userId}/trayectoria?carreraId=${careerId}`)
}
