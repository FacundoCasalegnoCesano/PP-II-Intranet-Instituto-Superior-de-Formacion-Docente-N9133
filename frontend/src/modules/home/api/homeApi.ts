import { apiClient } from '@/core/api/client'
import type { AcademicProgress, StudentCareer, StudentTrajectory } from '../types/home'

interface ApiReader {
  get<T>(path: string): Promise<T>
}

export function fetchStudentCareers(userId: number, client: ApiReader = apiClient): Promise<StudentCareer[]> {
  return client.get<StudentCareer[]>(`/inscripciones-carreras/alumno/${userId}`)
}

export function fetchStudentTrajectory(userId: number, careerId: number, client: ApiReader = apiClient): Promise<StudentTrajectory> {
  return client.get<StudentTrajectory>(`/estado-academico/alumno/${userId}/trayectoria?carreraId=${careerId}`)
}

export function progressFromTrajectory(trajectory: Pick<StudentTrajectory, 'cantidadMateriasAprobadas' | 'materias'>): AcademicProgress {
  const total = trajectory.materias.length
  const approved = Math.min(Math.max(trajectory.cantidadMateriasAprobadas, 0), total)
  return { approved, total, percent: total === 0 ? 0 : Math.round((approved / total) * 100) }
}
