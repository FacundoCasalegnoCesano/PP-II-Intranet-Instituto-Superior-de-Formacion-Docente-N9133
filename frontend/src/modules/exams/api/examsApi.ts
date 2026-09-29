import { apiClient } from '@/core/api/client'
import type { ExamAvailability, ExamCondition, ExamEnrollment, LegacyAvailableExam } from '../types/exams'

interface ExamClient {
  get<T>(path: string): Promise<T>
  post<T>(path: string, body?: unknown): Promise<T>
}

export function fetchAvailableExams(client?: Pick<ExamClient, 'get'>): Promise<LegacyAvailableExam[]>
export function fetchAvailableExams(options: { includeNoHabilitadas: true }, client?: Pick<ExamClient, 'get'>): Promise<ExamAvailability[]>
export function fetchAvailableExams(options?: { includeNoHabilitadas?: false }, client?: Pick<ExamClient, 'get'>): Promise<LegacyAvailableExam[]>
export function fetchAvailableExams(
  optionsOrClient: { includeNoHabilitadas?: boolean } | Pick<ExamClient, 'get'> = {},
  providedClient?: Pick<ExamClient, 'get'>
): Promise<LegacyAvailableExam[] | ExamAvailability[]> {
  const isClient = 'get' in optionsOrClient
  const options = isClient ? {} : optionsOrClient
  const client = (isClient ? optionsOrClient : providedClient) ?? apiClient
  const query = options.includeNoHabilitadas ? '?includeNoHabilitadas=true' : ''
  return client.get<LegacyAvailableExam[] | ExamAvailability[]>(`/examenes/disponibles${query}`)
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
