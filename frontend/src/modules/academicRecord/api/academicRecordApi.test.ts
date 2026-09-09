import { describe, expect, it, vi } from 'vitest'
import { fetchAcademicRecordCareers, fetchAcademicRecordTrajectory } from './academicRecordApi'

describe('academic record API', () => {
  it('reads the authenticated user academic record through the documented endpoints', async () => {
    const get = vi.fn().mockResolvedValue([])
    await fetchAcademicRecordCareers(13, { get })
    await fetchAcademicRecordTrajectory(13, 3, { get })

    expect(get).toHaveBeenNthCalledWith(1, '/inscripciones-carreras/alumno/13')
    expect(get).toHaveBeenNthCalledWith(2, '/estado-academico/alumno/13/trayectoria?carreraId=3')
  })
})
