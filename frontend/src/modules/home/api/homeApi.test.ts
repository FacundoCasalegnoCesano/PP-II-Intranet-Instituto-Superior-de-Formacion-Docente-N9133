import { describe, expect, it, vi } from 'vitest'
import { fetchStudentCareers, fetchStudentTrajectory, progressFromTrajectory } from './homeApi'

describe('student home API', () => {
  it('uses the authenticated user id to fetch careers and the selected career trajectory', async () => {
    const get = vi.fn()
      .mockResolvedValueOnce([{ id: 7, carreraId: 3, carrera: { id: 3, nombre: 'Profesorado', materias: [{ id: 1 }, { id: 2 }] } }])
      .mockResolvedValueOnce({
        alumnoUsuarioId: 13,
        carrera: { id: 3, nombre: 'Profesorado', duracionAnios: 4 },
        cantidadMateriasAprobadas: 1,
        promedioGeneral: 8,
        materias: [{ materia: { id: 1, nombre: 'Pedagogía' }, estado: 'APROBADA', definitiva: { nota: 8, via: 'EXAMEN_FINAL' } }],
      })

    await expect(fetchStudentCareers(13, { get })).resolves.toHaveLength(1)
    await expect(fetchStudentTrajectory(13, 3, { get })).resolves.toMatchObject({ promedioGeneral: 8 })

    expect(get).toHaveBeenNthCalledWith(1, '/inscripciones-carreras/alumno/13')
    expect(get).toHaveBeenNthCalledWith(2, '/estado-academico/alumno/13/trayectoria?carreraId=3')
  })

  it('derives approved progress from the API trajectory without inventing metrics', () => {
    expect(progressFromTrajectory({ cantidadMateriasAprobadas: 3, cantidadUnidadesTotal: 5, materias: [{}, {}, {}, {}, {}] })).toEqual({ approved: 3, total: 5, percent: 60 })
    expect(progressFromTrajectory({ cantidadMateriasAprobadas: 0, materias: [] })).toEqual({ approved: 0, total: 0, percent: 0 })
  })

  it('counts each curricular space once and uses the backend unit total', () => {
    const progress = progressFromTrajectory({
      cantidadMateriasAprobadas: 1,
      cantidadUnidadesTotal: 2,
      materias: [
        { materia: { id: 10, nombre: 'Práctica I' }, espacioCurricular: { id: 4, nombre: 'Práctica' } },
        { materia: { id: 11, nombre: 'Práctica II' }, espacioCurricular: { id: 4, nombre: 'Práctica' } },
        { materia: { id: 12, nombre: 'Pedagogía' }, espacioCurricular: null },
      ],
      espaciosCurriculares: [{ id: 4, nombre: 'Práctica', estado: 'APROBADA', nota: 8, definitiva: { nota: 8, via: 'ESPACIO_CURRICULAR' }, componentes: [] }],
    })
    expect(progress).toEqual({ approved: 1, total: 2, percent: 50 })
  })
})
