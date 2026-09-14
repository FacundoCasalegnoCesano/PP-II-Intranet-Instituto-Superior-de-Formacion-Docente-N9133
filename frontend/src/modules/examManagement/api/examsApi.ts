import { apiClient } from '@/core/api/client'
import type { PaginatedResult } from '@/core/api/contracts'
import type {
  CareerOption,
  ExamDetail,
  ExamFilters,
  ExamFormValues,
  ExamListItem,
  ExamResultsSnapshot,
  ExamWriteResponse,
  ExamWorkspace,
  InscriptoResultado,
  ResultWriteInput,
  SubjectOption,
  TeacherOption,
  TribunalMember,
  TribunalRole,
} from '../types/exams'

type ExamClient = Pick<typeof apiClient, 'get' | 'getPaginated' | 'post' | 'put' | 'delete'>

function query(params: Record<string, unknown>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const value = search.toString()
  return value ? `?${value}` : ''
}

export function listExamTables(filters: ExamFilters = {}, client: ExamClient = apiClient): Promise<PaginatedResult<ExamListItem>> {
  return client.getPaginated<ExamListItem>(`/examenes${query({
    materiaId: filters.materiaId,
    carreraId: filters.carreraId,
    cicloLectivo: filters.cicloLectivo,
    fechaDesde: filters.fechaDesde,
    fechaHasta: filters.fechaHasta,
    estadoMesa: filters.estadoMesa,
    page: filters.page,
    limit: filters.limit,
  })}`)
}

export function getExamTable(id: number, client: ExamClient = apiClient): Promise<ExamDetail> {
  return client.get<ExamDetail>(`/examenes/${id}`)
}

export function getExamResults(id: number, client: ExamClient = apiClient): Promise<InscriptoResultado[]> {
  return client.get<InscriptoResultado[]>(`/examenes/${id}/inscriptos`)
}

export async function getExamWorkspace(id: number, client: ExamClient = apiClient): Promise<ExamWorkspace> {
  const [detail, results] = await Promise.all([getExamTable(id, client), getExamResults(id, client)])
  return { detail, results }
}

export async function reloadExamResults(id: number, client: ExamClient = apiClient): Promise<ExamResultsSnapshot> {
  const [detail, results] = await Promise.all([getExamTable(id, client), getExamResults(id, client)])
  return { results, version: detail.version }
}

export function createExamTable(values: ExamFormValues & { fecha: string }, client: ExamClient = apiClient): Promise<ExamDetail> {
  return client.post<ExamDetail>('/examenes', values)
}

export function updateExamTable(id: number, values: Partial<ExamFormValues> & { expectedVersion: number }, client: ExamClient = apiClient): Promise<ExamDetail> {
  const { materiaId: _materiaId, ...payload } = values
  return client.put<ExamDetail>(`/examenes/${id}`, payload)
}

export function assignTribunalMember(
  mesaId: number,
  profesorId: number,
  rolTribunal: TribunalRole,
  expectedVersion: number,
  client: ExamClient = apiClient,
): Promise<TribunalMember & ExamWriteResponse> {
  return client.post<TribunalMember & ExamWriteResponse>('/examenes/tribunales', {
    mesaId,
    profesorId,
    rolTribunal,
    expectedVersion,
  })
}

export function removeTribunalMember(id: number, expectedVersion: number, client: ExamClient = apiClient): Promise<void> {
  return client.delete<void>(`/examenes/tribunales/${id}?expectedVersion=${expectedVersion}`)
}

export function saveExamResult(id: number, input: ResultWriteInput, client: ExamClient = apiClient): Promise<ExamWriteResponse> {
  const result = 'nota' in input
    ? { alumnoId: input.alumnoId, nota: input.nota, expectedVersion: input.expectedVersion }
    : { alumnoId: input.alumnoId, ausente: true, expectedVersion: input.expectedVersion }
  return client.post<ExamWriteResponse>(`/examenes/${id}/calificacion`, {
    ...result,
  })
}

export function closeExamTable(id: number, expectedVersion: number, client: ExamClient = apiClient): Promise<ExamWriteResponse> {
  return client.post<ExamWriteResponse>(`/examenes/${id}/cerrar`, { expectedVersion })
}

export function reopenExamTable(id: number, motivo: string, expectedVersion: number, client: ExamClient = apiClient): Promise<ExamWriteResponse> {
  return client.post<ExamWriteResponse>(`/examenes/${id}/reabrir`, { motivo, expectedVersion })
}

export function enrollStudent(id: number, alumnoId: number, condicion: 'REGULAR' | 'LIBRE', expectedVersion: number, client: ExamClient = apiClient): Promise<ExamWriteResponse> {
  return client.post<ExamWriteResponse>(`/examenes/${id}/inscribir`, { alumnoId, condicion, expectedVersion })
}

export function withdrawStudent(id: number, alumnoId: number, expectedVersion: number, client: ExamClient = apiClient): Promise<ExamWriteResponse> {
  return client.post<ExamWriteResponse>(`/examenes/${id}/desinscribir`, { alumnoId, expectedVersion })
}

export function listSubjectOptions(client: ExamClient = apiClient): Promise<PaginatedResult<SubjectOption>> {
  return client.getPaginated<SubjectOption>('/materias?limit=100')
}

export function listCareerOptions(client: ExamClient = apiClient): Promise<PaginatedResult<CareerOption>> {
  return client.getPaginated<CareerOption>('/carreras?limit=100')
}

export function listTeacherOptions(client: ExamClient = apiClient): Promise<PaginatedResult<TeacherOption>> {
  return client.getPaginated<TeacherOption>('/users?rol=PROFESOR&limit=100')
}

export function tribunalRoles(): TribunalRole[] {
  return ['PRESIDENTE', 'VOCAL', 'SUPLENTE']
}
