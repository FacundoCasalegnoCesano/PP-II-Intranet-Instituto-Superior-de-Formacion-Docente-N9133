import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/core/api/client'
import type { PaginatedResult } from '@/core/api/contracts'
import { getCareerStudyPlan, listCareerCatalog } from './careerCatalogApi'
import type { CareerStudyPlan, CatalogCareer } from '../types/careerCatalog'

const paginatedCareers: PaginatedResult<CatalogCareer> = {
  data: [
    { id: 2, nombre: 'Profesorado de Lengua', duracionAnios: 4, activo: true },
  ],
  pagination: { page: 2, limit: 20, total: 21, totalPages: 2, hasNextPage: false, hasPreviousPage: true },
}

const studyPlan: CareerStudyPlan = {
  id: 7,
  nombre: 'Profesorado de Lengua',
  duracionAnios: 4,
  activo: true,
  materias: [
    {
      id: 11,
      nombre: 'Lengua I',
      cargaHoraria: 96,
      tipoEspacio: 'MATERIA',
      curso: { id: 3, anio: 1 },
    },
  ],
}

function paginatedClient(result: PaginatedResult<CatalogCareer>): Pick<ApiClient, 'getPaginated'> & { getPaginated: ReturnType<typeof vi.fn> } {
  return { getPaginated: vi.fn().mockResolvedValue(result) }
}

function planClient(result: CareerStudyPlan): Pick<ApiClient, 'get'> & { get: ReturnType<typeof vi.fn> } {
  return { get: vi.fn().mockResolvedValue(result) }
}

describe('careerCatalogApi', () => {
  it('lists a trimmed and encoded student catalog with the complete pagination result', async () => {
    const client = paginatedClient(paginatedCareers)

    const result = await listCareerCatalog({ page: 2, limit: 20, search: ' Lengua ' }, client)

    expect(client.getPaginated).toHaveBeenCalledWith('/carreras/catalogo?page=2&limit=20&search=Lengua')
    expect(result).toEqual(paginatedCareers)
  })

  it('uses the default page and limit when filters are omitted', async () => {
    const client = paginatedClient(paginatedCareers)

    await listCareerCatalog(undefined, client)

    expect(client.getPaginated).toHaveBeenCalledWith('/carreras/catalogo?page=1&limit=20')
  })

  it('omits a blank or whitespace-only search term', async () => {
    const client = paginatedClient(paginatedCareers)

    await listCareerCatalog({ search: '   ' }, client)

    expect(client.getPaginated).toHaveBeenCalledWith('/carreras/catalogo?page=1&limit=20')
  })

  it('gets a career study plan through the student-owned contract', async () => {
    const client = planClient(studyPlan)

    const result = await getCareerStudyPlan(7, client)

    expect(client.get).toHaveBeenCalledWith('/carreras/7/plan-estudio')
    expect(result).toEqual(studyPlan)
  })

  it('keeps API prefixes and direct network access out of endpoint construction', async () => {
    const getPaginated = vi.fn().mockResolvedValue(paginatedCareers)
    const get = vi.fn().mockResolvedValue(studyPlan)

    await listCareerCatalog({ page: 1, limit: 20, search: 'A/B' }, { getPaginated })
    await getCareerStudyPlan(7, { get })

    const catalogEndpoint = getPaginated.mock.calls[0][0] as string
    const planEndpoint = get.mock.calls[0][0] as string
    expect(catalogEndpoint).not.toContain('/api')
    expect(planEndpoint).not.toContain('/api')
  })
})
