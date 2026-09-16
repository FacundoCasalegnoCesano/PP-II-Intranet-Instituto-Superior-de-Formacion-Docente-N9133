import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/core/api/client'
import {
  create,
  getById,
  list,
  listCareerSubjects,
  listFilterCareers,
  listFilterSubjects,
  listStudentCareers,
  resolve,
  saveComplementaryGrade,
} from './homologationsApi'

const page = {
  data: [],
  pagination: { page: 2, limit: 20, total: 0, totalPages: 0 },
}

function client(): Pick<ApiClient, 'getPaginated' | 'get' | 'postWithMessage'> & {
  getPaginated: ReturnType<typeof vi.fn>
  get: ReturnType<typeof vi.fn>
  postWithMessage: ReturnType<typeof vi.fn>
} {
  return {
    getPaginated: vi.fn().mockResolvedValue(page),
    get: vi.fn().mockResolvedValue([]),
    postWithMessage: vi.fn().mockResolvedValue({ data: {}, message: 'ok' }),
  }
}

describe('homologations API', () => {
  it('serializa filtros paginados sin valores vacíos', async () => {
    const api = client()

    await expect(list({
      search: '  Lucia  ',
      estado: 'PENDIENTE',
      tipo: 'PARCIAL',
      carreraId: 3,
      materiaId: 14,
      page: 2,
      limit: 20,
    }, api)).resolves.toEqual(page)

    expect(api.getPaginated).toHaveBeenCalledWith(
      '/homologaciones?search=Lucia&estado=PENDIENTE&tipo=PARCIAL&carreraId=3&materiaId=14&page=2&limit=20',
    )

    await list({ search: '', estado: undefined, tipo: undefined }, api)
    expect(api.getPaginated).toHaveBeenLastCalledWith('/homologaciones')

    await list({ search: '  A&B +  ' }, api)
    expect(api.getPaginated).toHaveBeenLastCalledWith('/homologaciones?search=A%26B+%2B')
  })

  it('envía calificación en total y null en parcial', async () => {
    const api = client()
    const base = { alumnoId: 13, materiaId: 14, observacion: null }

    await create({ ...base, tipoHomologacion: 'TOTAL', calificacion: 8 }, api)
    await create({ ...base, tipoHomologacion: 'PARCIAL' }, api)

    expect(api.postWithMessage).toHaveBeenNthCalledWith(1, '/homologaciones', {
      ...base,
      tipoHomologacion: 'TOTAL',
      calificacion: 8,
    })
    expect(api.postWithMessage).toHaveBeenNthCalledWith(2, '/homologaciones', {
      ...base,
      tipoHomologacion: 'PARCIAL',
      calificacion: null,
    })
  })

  it('usa los endpoints de detalle, nota complementaria y resolución', async () => {
    const api = client()

    await getById(7, api)
    await saveComplementaryGrade(7, 8, api)
    await resolve(7, 'APROBAR', api)

    expect(api.get).toHaveBeenCalledWith('/homologaciones/7')
    expect(api.postWithMessage).toHaveBeenNthCalledWith(1, '/homologaciones/7/nota-complementaria', {
      notaExamenHomologacion: 8,
    })
    expect(api.postWithMessage).toHaveBeenNthCalledWith(2, '/homologaciones/7/resolver', { accion: 'APROBAR' })
  })

  it('reutiliza catálogos existentes y conserva el ID de cuenta del alumno', async () => {
    const api = client()
    api.get
      .mockResolvedValueOnce([{ id: 2, carreraId: 3, carrera: { id: 3, nombre: 'Inicial', materias: [] } }])
      .mockResolvedValueOnce([
        { anio: 1, cantidad: 2, materias: [
          { id: 14, nombre: 'Álgebra', activo: true },
          { id: 15, nombre: 'Historia', activo: false },
        ] },
      ])

    await expect(listStudentCareers(13, api)).resolves.toHaveLength(1)
    await expect(listCareerSubjects(3, api)).resolves.toEqual([{ id: 14, nombre: 'Álgebra', activo: true }])

    expect(api.get).toHaveBeenNthCalledWith(1, '/inscripciones-carreras/alumno/13')
    expect(api.get).toHaveBeenNthCalledWith(2, '/materias/carrera/3/por-anio')
  })

  it('aplana grupos incompletos y conserva únicamente materias activas explícitas', async () => {
    const api = client()
    api.get.mockResolvedValueOnce([
      { anio: 1, cantidad: 3, materias: [
        { id: 14, nombre: 'Álgebra', activo: true },
        { id: 15, nombre: 'Historia', activo: false },
        { id: 16, nombre: 'Sin estado' },
      ] },
      { anio: 2, cantidad: 0 },
    ])

    await expect(listCareerSubjects(3, api)).resolves.toEqual([{ id: 14, nombre: 'Álgebra', activo: true }])
  })

  it('recorre todas las páginas del catálogo histórico de carreras', async () => {
    const api = client()
    api.getPaginated
      .mockResolvedValueOnce({ data: [{ id: 3, nombre: 'Inicial', activo: true }], pagination: { page: 1, limit: 50, total: 2, totalPages: 2 } })
      .mockResolvedValueOnce({ data: [{ id: 4, nombre: 'Primaria', activo: false }], pagination: { page: 2, limit: 50, total: 2, totalPages: 2 } })

    await expect(listFilterCareers(api)).resolves.toEqual([
      { id: 3, nombre: 'Inicial', activo: true },
      { id: 4, nombre: 'Primaria', activo: false },
    ])
    expect(api.getPaginated).toHaveBeenNthCalledWith(1, '/carreras?page=1&limit=50')
    expect(api.getPaginated).toHaveBeenNthCalledWith(2, '/carreras?page=2&limit=50')
  })

  it('recorre todas las páginas de materias históricas filtradas por carrera', async () => {
    const api = client()
    api.getPaginated
      .mockResolvedValueOnce({ data: [{ id: 14, nombre: 'Álgebra', activo: true, carreraId: 3 }], pagination: { page: 1, limit: 50, total: 2, totalPages: 2 } })
      .mockResolvedValueOnce({ data: [{ id: 15, nombre: 'Historia', activo: false, carreraId: 3 }], pagination: { page: 2, limit: 50, total: 2, totalPages: 2 } })

    await expect(listFilterSubjects(3, api)).resolves.toEqual([
      { id: 14, nombre: 'Álgebra', activo: true, carreraId: 3 },
      { id: 15, nombre: 'Historia', activo: false, carreraId: 3 },
    ])
    expect(api.getPaginated).toHaveBeenNthCalledWith(1, '/materias?carreraId=3&page=1&limit=50')
    expect(api.getPaginated).toHaveBeenNthCalledWith(2, '/materias?carreraId=3&page=2&limit=50')
  })

  it('usa el nombre público usuarioId sin cambiar la URL legacy', async () => {
    const api = client()

    await listStudentCareers(42, api)

    expect(api.get).toHaveBeenCalledWith('/inscripciones-carreras/alumno/42')
  })
})
