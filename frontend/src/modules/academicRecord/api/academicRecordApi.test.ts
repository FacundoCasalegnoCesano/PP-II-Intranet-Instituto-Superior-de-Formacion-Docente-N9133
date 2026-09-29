import { describe, expect, it, vi } from 'vitest'
import { fetchAcademicRecordAttendance, fetchAcademicRecordCareers, fetchAcademicRecordTrajectory } from './academicRecordApi'

describe('academic record API', () => {
  it('reads the authenticated user academic record through the documented endpoints', async () => {
    const get = vi.fn().mockResolvedValue([])
    await fetchAcademicRecordCareers(13, { get })
    await fetchAcademicRecordTrajectory(13, 3, { get })

    expect(get).toHaveBeenNthCalledWith(1, '/inscripciones-carreras/alumno/13')
    expect(get).toHaveBeenNthCalledWith(2, '/estado-academico/alumno/13/trayectoria?carreraId=3')
  })

  it('requests attendance detail with the selected career, course and page', async () => {
    const getPaginated = vi.fn().mockResolvedValue({ data: [], pagination: { page: 2, limit: 20, total: 0, totalPages: 0 } })
    await fetchAcademicRecordAttendance(13, { carreraId: 3, cursadaId: 12, page: 2 }, { getPaginated })
    expect(getPaginated).toHaveBeenCalledWith('/asistencias/alumno/13?carreraId=3&cursadaId=12&page=2&limit=20')
  })
})
