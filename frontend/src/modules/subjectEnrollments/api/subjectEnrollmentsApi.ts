import { apiClient } from '@/core/api/client'
import type { PaginatedResult } from '@/core/api/contracts'
import type { AvailableSubject, SubjectEnrollment, SubjectEnrollmentInput, SubjectEnrollmentVerification } from '../types/subjectEnrollments'

interface SubjectEnrollmentClient {
  get<T>(path: string): Promise<T>
  getPaginated<T>(path: string): Promise<PaginatedResult<T>>
  post<T>(path: string, body?: unknown): Promise<T>
  delete<T>(path: string): Promise<T>
}

export function fetchAvailableSubjects(cicloLectivo: number, client: Pick<SubjectEnrollmentClient, 'get'> = apiClient): Promise<AvailableSubject[]> {
  return client.get<AvailableSubject[]>(`/inscripciones-materias/disponibles?cicloLectivo=${cicloLectivo}`)
}

export function fetchMySubjectEnrollments(userId: number, page = 1, client: Pick<SubjectEnrollmentClient, 'getPaginated'> = apiClient): Promise<PaginatedResult<SubjectEnrollment>> {
  return client.getPaginated<SubjectEnrollment>(`/inscripciones-materias/alumno/${userId}?page=${page}&limit=20`)
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
