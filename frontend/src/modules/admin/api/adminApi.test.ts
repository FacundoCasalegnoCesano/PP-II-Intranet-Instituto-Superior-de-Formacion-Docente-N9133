import { describe, expect, it, vi } from 'vitest'
import { adminApi } from './adminApi'

vi.mock('@/core/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    getPaginated: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

import { apiClient } from '@/core/api/client'

describe('adminApi', () => {
  it('preserves URL filters and pagination for administrative lists', async () => {
    vi.mocked(apiClient.getPaginated).mockResolvedValue({ data: [], pagination: { page: 2, limit: 20, total: 0, totalPages: 0 } })
    await adminApi.listSubjects({ search: '  lengua ', carreraId: 3, page: 2 })
    expect(apiClient.getPaginated).toHaveBeenCalledWith('/materias?search=++lengua+&carreraId=3&page=2')
  })

  it('uses the role-specific creation endpoint and never exposes a generated password', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ idUsuario: 9 })
    await adminApi.createUser('ALUMNO', { apellidoNombre: 'Ada', password: 'Temporal!9', dni: '12345678' })
    expect(apiClient.post).toHaveBeenCalledWith('/alumnos', expect.objectContaining({ rol: 'ALUMNO' }))
  })

  it('sends an explicit role payload and supports logical role removal', async () => {
    vi.mocked(apiClient.put).mockResolvedValue({})
    vi.mocked(apiClient.delete).mockResolvedValue(undefined)
    await adminApi.setUserRole(7, 'ALUMNO', { domicilio: 'Centro', anioEgreso: 2020, institucionProcedencia: 'Escuela' })
    await adminApi.removeUserRole(7, 'ALUMNO')
    expect(apiClient.put).toHaveBeenCalledWith('/users/7/role', expect.objectContaining({ rol: 'ALUMNO', alumno: expect.any(Object) }))
    expect(apiClient.delete).toHaveBeenCalledWith('/users/7/role/ALUMNO')
  })
})
