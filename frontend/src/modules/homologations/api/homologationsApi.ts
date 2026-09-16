import { apiClient, type ApiClient } from '@/core/api/client'
import type { PaginatedResult } from '@/core/api/contracts'
import type {
  ComplementaryGradePayload,
  CreateHomologationPayload,
  Homologation,
  HomologationCareerOption,
  HomologationFilters,
  MessageResult,
  ResolveHomologationPayload,
  StudentCareer,
  SubjectOption,
} from '../types/homologations'

type HomologationClient = Pick<ApiClient, 'get' | 'getPaginated' | 'postWithMessage'>

function query(params: Record<string, unknown>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const result = search.toString()
  return result ? `?${result}` : ''
}

export function list(
  filters: HomologationFilters = {},
  client: Pick<HomologationClient, 'getPaginated'> = apiClient,
): Promise<PaginatedResult<Homologation>> {
  return client.getPaginated<Homologation>(`/homologaciones${query({
    search: filters.search?.trim(),
    estado: filters.estado,
    tipo: filters.tipo,
    carreraId: filters.carreraId,
    materiaId: filters.materiaId,
    page: filters.page,
    limit: filters.limit,
  })}`)
}

export function getById(
  id: number,
  client: Pick<HomologationClient, 'get'> = apiClient,
): Promise<Homologation> {
  return client.get<Homologation>(`/homologaciones/${id}`)
}

export function create(
  payload: CreateHomologationPayload,
  client: Pick<HomologationClient, 'postWithMessage'> = apiClient,
): Promise<MessageResult<Homologation>> {
  const body: CreateHomologationPayload = payload.tipoHomologacion === 'PARCIAL'
    ? { ...payload, calificacion: null }
    : payload
  return client.postWithMessage<Homologation>('/homologaciones', body)
}

export function saveComplementaryGrade(
  id: number,
  nota: number,
  client: Pick<HomologationClient, 'postWithMessage'> = apiClient,
): Promise<MessageResult<Homologation>> {
  const payload: ComplementaryGradePayload = { notaExamenHomologacion: nota }
  return client.postWithMessage<Homologation>(`/homologaciones/${id}/nota-complementaria`, payload)
}

export function resolve(
  id: number,
  accion: ResolveHomologationPayload['accion'],
  client: Pick<HomologationClient, 'postWithMessage'> = apiClient,
): Promise<MessageResult<Homologation>> {
  const payload: ResolveHomologationPayload = { accion }
  return client.postWithMessage<Homologation>(`/homologaciones/${id}/resolver`, payload)
}

export function listStudentCareers(
  usuarioId: number,
  client: Pick<HomologationClient, 'get'> = apiClient,
): Promise<StudentCareer[]> {
  return client.get<StudentCareer[]>(`/inscripciones-carreras/alumno/${usuarioId}`)
}

interface SubjectGroup {
  materias?: SubjectOption[]
}

const CATALOG_PAGE_LIMIT = 50

async function listAllCatalogPages<T>(loadPage: (page: number) => Promise<PaginatedResult<T>>): Promise<T[]> {
  const firstPage = await loadPage(1)
  const values = [...firstPage.data]
  for (let page = 2; page <= firstPage.pagination.totalPages; page += 1) {
    const nextPage = await loadPage(page)
    values.push(...nextPage.data)
  }
  return values
}

export async function listCareerSubjects(
  carreraId: number,
  client: Pick<HomologationClient, 'get'> = apiClient,
): Promise<SubjectOption[]> {
  const groups = await client.get<SubjectGroup[]>(`/materias/carrera/${carreraId}/por-anio`)
  return groups.flatMap((group) => group.materias ?? []).filter((subject) => subject.activo === true)
}

export async function listFilterCareers(
  client: Pick<HomologationClient, 'getPaginated'> = apiClient,
): Promise<HomologationCareerOption[]> {
  const careers = await listAllCatalogPages((page) => client.getPaginated<HomologationCareerOption>(`/carreras${query({ page, limit: CATALOG_PAGE_LIMIT })}`))
  return [...new Map(careers.map((career) => [career.id, career])).values()]
}

export async function listFilterSubjects(
  carreraId: number,
  client: Pick<HomologationClient, 'getPaginated'> = apiClient,
): Promise<SubjectOption[]> {
  const subjects = await listAllCatalogPages((page) => client.getPaginated<SubjectOption>(`/materias${query({ carreraId, page, limit: CATALOG_PAGE_LIMIT })}`))
  return [...new Map(subjects.map((subject) => [subject.id, subject])).values()]
}

export const homologationsApi = {
  list,
  getById,
  create,
  saveComplementaryGrade,
  resolve,
  listStudentCareers,
  listCareerSubjects,
  listFilterCareers,
  listFilterSubjects,
}
