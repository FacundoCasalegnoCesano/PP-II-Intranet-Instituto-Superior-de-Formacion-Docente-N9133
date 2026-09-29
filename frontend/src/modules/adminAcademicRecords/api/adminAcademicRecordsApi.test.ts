import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchAdminStudentCareers, fetchAdminStudents, fetchAllAdminCareers } from './adminAcademicRecordsApi'

const mocks = vi.hoisted(() => ({ listCareers: vi.fn() }))
vi.mock('@/modules/admin/api/adminApi', () => ({ adminApi: mocks }))

describe('adminAcademicRecordsApi', () => {
  beforeEach(() => vi.clearAllMocks())

  it('serializa búsqueda, carrera y paginación del listado de alumnos', async () => {
    const getPaginated = vi.fn().mockResolvedValue({ data: [], pagination: { page: 2, limit: 20, total: 21, totalPages: 2 } })
    await fetchAdminStudents({ search: 'Ana Pérez', carreraId: 4, page: 2 }, { get: vi.fn(), getPaginated })
    expect(getPaginated).toHaveBeenCalledWith('/alumnos?search=Ana+P%C3%A9rez&carreraId=4&page=2&limit=20')
  })

  it('solicita explícitamente el historial de carreras del alumno', async () => {
    const get = vi.fn().mockResolvedValue([])
    await fetchAdminStudentCareers(13, { get })
    expect(get).toHaveBeenCalledWith('/inscripciones-carreras/alumno/13?includeInactive=true')
  })

  it('carga todas las páginas del catálogo y rechaza paginación incoherente', async () => {
    mocks.listCareers
      .mockResolvedValueOnce({ data: Array.from({ length: 20 }, (_, id) => ({ id: id + 1, nombre: `Carrera ${id + 1}`, duracionAnios: 4, activo: true })), pagination: { page: 1, limit: 20, total: 21, totalPages: 2 } })
      .mockResolvedValueOnce({ data: [{ id: 21, nombre: 'Historia', duracionAnios: 4, activo: false }], pagination: { page: 2, limit: 20, total: 21, totalPages: 2 } })
    await expect(fetchAllAdminCareers()).resolves.toHaveLength(21)
    expect(mocks.listCareers).toHaveBeenNthCalledWith(2, { page: 2, limit: 20 })

    mocks.listCareers.mockResolvedValueOnce({ data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } })
    await expect(fetchAllAdminCareers()).rejects.toThrow('No pudimos cargar las carreras.')
  })
})
