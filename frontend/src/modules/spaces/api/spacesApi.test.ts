import { beforeEach, describe, expect, it, vi } from 'vitest'
import { spacesApi } from './spacesApi'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }))
vi.mock('@/core/api/client', () => ({ apiClient: mocks }))

describe('spacesApi', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses the agreed space CRUD paths and configuration payload', async () => {
    mocks.get.mockResolvedValueOnce([])
    await spacesApi.list()
    expect(mocks.get).toHaveBeenCalledWith('/espacios-curriculares')
    const input = { nombre: 'Campo de la Práctica', carreraId: 3, descripcion: 'Trayecto', componentesIds: [10, 11] }
    await spacesApi.create(input)
    expect(mocks.post).toHaveBeenCalledWith('/espacios-curriculares', input)
    await spacesApi.update(8, { nombre: 'Campo de la Práctica II', descripcion: 'Actualizado' })
    expect(mocks.patch).toHaveBeenCalledWith('/espacios-curriculares/8', { nombre: 'Campo de la Práctica II', descripcion: 'Actualizado' })
    await spacesApi.activate(8)
    expect(mocks.post).toHaveBeenCalledWith('/espacios-curriculares/8/activate')
  })

  it('exposes the Prisma response shape used by the space admin panel', async () => {
    const backendSpace = {
      id: 8, nombre: 'Campo de la Práctica', carreraId: 3, descripcion: null, activo: true,
      composicionBloqueadaAt: '2026-10-20T12:00:00.000Z',
      carrera: { id: 3, nombre: 'Profesorado' }, materias: [{ id: 10, nombre: 'Práctica I' }, { id: 11, nombre: 'Práctica II' }],
    }
    mocks.get.mockResolvedValueOnce(backendSpace)
    const result = await spacesApi.get(8)
    expect(result).toEqual(backendSpace)
    expect(result.activo).toBe(true)
    expect(result.materias.map((subject) => subject.id)).toEqual([10, 11])
    expect(result.composicionBloqueadaAt).not.toBeNull()
  })

  it('sends a single XOR requirement type with application flags', async () => {
    const body = { espacioRequeridoId: 6, aplicaCursado: true, aplicaRendir: false }
    await spacesApi.addPrerequisite(8, body)
    expect(mocks.post).toHaveBeenCalledWith('/espacios-curriculares/8/correlatividades', body)
    await spacesApi.removePrerequisite(8, 22)
    expect(mocks.delete).toHaveBeenCalledWith('/espacios-curriculares/8/correlatividades/22')
  })
})
