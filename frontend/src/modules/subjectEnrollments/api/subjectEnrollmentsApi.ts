import { apiClient } from '@/core/api/client'
import type { AvailableSubject, SubjectEnrollment, SubjectEnrollmentInput, SubjectEnrollmentVerification } from '../types/subjectEnrollments'

interface SubjectEnrollmentClient {
  get<T>(path: string): Promise<T>
  post<T>(path: string, body?: unknown): Promise<T>
  delete<T>(path: string): Promise<T>
}

export function fetchAvailableSubjects(cicloLectivo: number, client: Pick<SubjectEnrollmentClient, 'get'> = apiClient): Promise<AvailableSubject[]> {
  return client.get<AvailableSubject[]>(`/inscripciones-materias/disponibles?cicloLectivo=${cicloLectivo}`)
}

export function fetchMySubjectEnrollments(userId: number, client: Pick<SubjectEnrollmentClient, 'get'> = apiClient): Promise<SubjectEnrollment[]> {
  return client.get<SubjectEnrollment[]>(`/inscripciones-materias/alumno/${userId}`)
}

export function verifySubjectEnrollment(materiaId: number, cicloLectivo: number, client: Pick<SubjectEnrollmentClient, 'get'> = apiClient): Promise<SubjectEnrollmentVerification> {
  return client.get<SubjectEnrollmentVerification>(`/inscripciones-materias/verificar/${materiaId}?cicloLectivo=${cicloLectivo}`)
}

export function enrollInSubject(input: SubjectEnrollmentInput, client: Pick<SubjectEnrollmentClient, 'post'> = apiClient): Promise<SubjectEnrollment> {
  return client.post<SubjectEnrollment>('/inscripciones-materias', input)
}

export function dropSubjectEnrollment(id: number, client: Pick<SubjectEnrollmentClient, 'delete'> = apiClient): Promise<SubjectEnrollment> {
  return client.delete<SubjectEnrollment>(`/inscripciones-materias/${id}`)
}
