import { describe, expect, it, vi } from 'vitest'
import { adminApi } from './adminApi'
import type { SubjectWritePayload } from '../types/admin'

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
    await adminApi.createUser('ALUMNO', { apellidoNombre: 'Ada', password: 'Temporal!9', dni: '12345678', alumno: { domicilio: 'Centro', anioEgreso: 2020 } })
    expect(apiClient.post).toHaveBeenCalledWith('/alumnos', expect.objectContaining({ rol: 'ALUMNO', domicilio: 'Centro', anioEgreso: 2020 }))
  })

  it('sends an explicit role payload and supports logical role removal', async () => {
    vi.mocked(apiClient.put).mockResolvedValue({})
    vi.mocked(apiClient.delete).mockResolvedValue(undefined)
    await adminApi.setUserRole(7, 'ALUMNO', { domicilio: 'Centro', anioEgreso: 2020, institucionProcedencia: 'Escuela' })
    await adminApi.removeUserRole(7, 'ALUMNO')
    expect(apiClient.put).toHaveBeenCalledWith('/users/7/role', expect.objectContaining({ rol: 'ALUMNO', alumno: expect.any(Object) }))
    expect(apiClient.delete).toHaveBeenCalledWith('/users/7/role/ALUMNO')
  })

  it('loads active subject options grouped by year', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([{ anio: 1, cantidad: 1, materias: [] }])

    await adminApi.getSubjectsByYear(3)

    expect(apiClient.get).toHaveBeenCalledWith('/materias/carrera/3/por-anio')
  })

  it('sends prerequisite ids without legacy flags or requirement types', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({})
    vi.mocked(apiClient.put).mockResolvedValue({})
    const payload: SubjectWritePayload = {
      nombre: 'Didáctica General',
      carreraId: 3,
      cursoAnio: 2,
      cargaHoraria: 64,
      tipoEspacio: 'MATERIA',
      correlativasIds: [3, 4],
    }

    await adminApi.createSubject(payload)
    await adminApi.updateSubject(9, payload)

    expect(apiClient.post).toHaveBeenCalledWith('/materias', payload)
    expect(apiClient.put).toHaveBeenCalledWith('/materias/9', payload)
    expect(payload).not.toHaveProperty('tipoRequisito')
    expect(payload).not.toHaveProperty('aplicaCursado')
    expect(payload).not.toHaveProperty('aplicaRendir')
  })

  it('sends only materiaRequeridaId through the individual prerequisite endpoint', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({})

    await adminApi.addPrerequisite(9, {
      materiaRequeridaId: 3,
      tipoRequisito: 'OBLIGATORIA',
    } as any)

    expect(apiClient.post).toHaveBeenCalledWith('/materias/9/correlatividades', {
      materiaRequeridaId: 3,
    })
  })
})
