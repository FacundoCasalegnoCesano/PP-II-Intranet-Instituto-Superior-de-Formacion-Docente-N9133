import { describe, expect, it, vi } from 'vitest'
import {
  dropSubjectEnrollment,
  enrollInSubject,
  fetchAvailableSubjects,
  fetchMySubjectEnrollments,
  verifySubjectEnrollment,
} from './subjectEnrollmentsApi'

describe('subject enrollment API', () => {
  it('uses self-service endpoints and never sends alumnoId', async () => {
    const get = vi.fn().mockResolvedValue([])
    const post = vi.fn().mockResolvedValue({ id: 2 })
    const remove = vi.fn().mockResolvedValue({ id: 2 })
    const client = { get, post, delete: remove }

    await fetchAvailableSubjects(2026, client)
    await fetchMySubjectEnrollments(13, client)
    await verifySubjectEnrollment(5, 2026, client)
    await enrollInSubject({ materiaId: 5, cicloLectivo: 2026, modalidadElegida: 'PRESENCIAL' }, client)
    await dropSubjectEnrollment(2, client)

    expect(get).toHaveBeenNthCalledWith(1, '/inscripciones-materias/disponibles?cicloLectivo=2026')
    expect(get).toHaveBeenNthCalledWith(2, '/inscripciones-materias/alumno/13')
    expect(get).toHaveBeenNthCalledWith(3, '/inscripciones-materias/verificar/5?cicloLectivo=2026')
    expect(post).toHaveBeenCalledWith('/inscripciones-materias', {
      materiaId: 5,
      cicloLectivo: 2026,
      modalidadElegida: 'PRESENCIAL',
    })
    expect(remove).toHaveBeenCalledWith('/inscripciones-materias/2')
    expect(JSON.stringify(post.mock.calls[0]?.[1])).not.toContain('alumnoId')
  })
})
