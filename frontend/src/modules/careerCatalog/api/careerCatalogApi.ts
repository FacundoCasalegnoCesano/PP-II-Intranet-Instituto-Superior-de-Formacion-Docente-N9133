import { apiClient } from '@/core/api/client'
import type { ApiClient } from '@/core/api/client'
import type { PaginatedResult } from '@/core/api/contracts'
import type { CareerCatalogFilters, CareerStudyPlan, CatalogCareer } from '../types/careerCatalog'

const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 20

function catalogEndpoint(filters: CareerCatalogFilters = {}): string {
  const params = new URLSearchParams()
  params.set('page', String(filters.page ?? DEFAULT_PAGE))
  params.set('limit', String(filters.limit ?? DEFAULT_LIMIT))

  const search = filters.search?.trim()
  if (search) params.set('search', search)

  return `/carreras/catalogo?${params.toString()}`
}

export function listCareerCatalog(
  filters: CareerCatalogFilters = {},
  client?: Pick<ApiClient, 'getPaginated'>,
): Promise<PaginatedResult<CatalogCareer>> {
  return (client ?? apiClient).getPaginated<CatalogCareer>(catalogEndpoint(filters))
}

export function getCareerStudyPlan(
  careerId: number,
  client?: Pick<ApiClient, 'get'>,
): Promise<CareerStudyPlan> {
  return (client ?? apiClient).get<CareerStudyPlan>(`/carreras/${careerId}/plan-estudio`)
}
