import { apiClient } from '@/core/api/client'
import type { AvailableExam, ExamCondition, ExamEnrollment } from '../types/exams'

interface ExamClient {
  get<T>(path: string): Promise<T>
  post<T>(path: string, body?: unknown): Promise<T>
}

export function fetchAvailableExams(client: Pick<ExamClient, 'get'> = apiClient): Promise<AvailableExam[]> {
  return client.get<AvailableExam[]>('/examenes/disponibles')
}

export function fetchMyExamEnrollments(userId: number, client: Pick<ExamClient, 'get'> = apiClient): Promise<ExamEnrollment[]> {
  return client.get<ExamEnrollment[]>(`/examenes/alumno/${userId}/inscripciones`)
}

export function enrollInExam(examenId: number, condicion: ExamCondition, expectedVersion?: number, client: Pick<ExamClient, 'post'> = apiClient): Promise<ExamEnrollment> {
  return client.post<ExamEnrollment>(`/examenes/${examenId}/inscribir`, { condicion, ...(expectedVersion === undefined ? {} : { expectedVersion }) })
}

export function withdrawFromExam(examenId: number, expectedVersion?: number, client: Pick<ExamClient, 'post'> = apiClient): Promise<ExamEnrollment> {
  return client.post<ExamEnrollment>(`/examenes/${examenId}/desinscribir`, expectedVersion === undefined ? {} : { expectedVersion })
}
