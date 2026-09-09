import { describe, expect, it, vi } from 'vitest'
import { teacherCoursesApi } from './teacherCoursesApi'
import type { AcademicSummary, ClassRecord, ClassSaveResult } from '../types/teacherCourses'

const classDetailFixture: ClassRecord = {
  fecha: '2026-09-08',
  temaDesarrollado: 'Ecuaciones',
  asistencias: [{
    alumnoId: 21,
    nombre: 'Ana Pérez',
    dni: 40111222,
    presente: true,
    justificado: false,
    observacion: null,
  }],
}

const classSaveFixture: ClassSaveResult = {
  fecha: '2026-09-08',
  temaDesarrollado: 'Ecuaciones',
  registros: 1,
}

const academicSummaryFixture: AcademicSummary = {
  cursadaId: 12,
  materia: { id: 3, nombre: 'Matemática' },
  anioLectivo: 2026,
  periodo: 'ANUAL',
  alumnos: [{
    alumno: { alumnoId: 21, apellidoNombre: 'Ana Pérez', dni: 40111222 },
    asistencia: null,
    parcialesEfectivos: [{ numero: 1, notaOriginal: 4, notaEfectiva: 7, recuperado: true }],
    tps: null,
    promedio: 7,
    notaMinima: 6,
    estado: 'REGULAR',
    requisitosPendientes: [],
  }],
}

function client() {
  return {
    get: vi.fn().mockResolvedValue([]),
    getPaginated: vi.fn().mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    }),
    put: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
  }
}

describe('teacherCoursesApi', () => {
  it('builds the course query without dropping valid zero or false values', async () => {
    const api = client()

    await teacherCoursesApi.list({ anioLectivo: 0, activo: false, page: 0, limit: 0 }, api)

    expect(api.getPaginated).toHaveBeenCalledWith('/cursadas?anioLectivo=0&activo=false&page=0&limit=0')
  })

  it('omits empty filters from grade queries', async () => {
    const api = client()

    await teacherCoursesApi.listGrades(12, { tipo: '', numero: 0, alumnoId: 0 }, api)

    expect(api.get).toHaveBeenCalledWith('/calificaciones/cursada/12?numero=0&alumnoId=0')
  })

  it('uses the approved backend paths for all teacher course operations', async () => {
    const api = client()
    const classPayload = { temaDesarrollado: 'Ecuaciones', asistencias: [] }
    const gradesPayload = { cursadaId: 12, calificaciones: [] }

    await teacherCoursesApi.get(12, api)
    await teacherCoursesApi.listStudents(12, api)
    await teacherCoursesApi.listClasses(12, api)
    await teacherCoursesApi.getClass(12, '2026-09-08', api)
    await teacherCoursesApi.saveClass(12, '2026-09-08', classPayload, api)
    await teacherCoursesApi.listGrades(12, undefined, api)
    await teacherCoursesApi.saveGrades(gradesPayload, api)
    await teacherCoursesApi.getAttendanceSummary(12, api)
    await teacherCoursesApi.getAcademicSummary(12, api)

    expect(api.get).toHaveBeenCalledWith('/cursadas/12')
    expect(api.get).toHaveBeenCalledWith('/cursadas/12/inscriptos')
    expect(api.get).toHaveBeenCalledWith('/cursadas/12/clases')
    expect(api.get).toHaveBeenCalledWith('/cursadas/12/clases/2026-09-08')
    expect(api.put).toHaveBeenCalledWith('/cursadas/12/clases/2026-09-08', classPayload)
    expect(api.get).toHaveBeenCalledWith('/calificaciones/cursada/12')
    expect(api.post).toHaveBeenCalledWith('/calificaciones/carga-masiva', gradesPayload)
    expect(api.get).toHaveBeenCalledWith('/asistencias/resumen/12')
    expect(api.get).toHaveBeenCalledWith('/estado-academico/cursada/12')
  })

  it('keeps the runtime class detail, save result, and academic summary DTOs', async () => {
    const api = client()
    api.get.mockImplementation((path: string) => {
      if (path === '/cursadas/12/clases/2026-09-08') return Promise.resolve(classDetailFixture)
      if (path === '/estado-academico/cursada/12') return Promise.resolve(academicSummaryFixture)
      return Promise.resolve([])
    })
    api.put.mockResolvedValue(classSaveFixture)

    await expect(teacherCoursesApi.getClass(12, '2026-09-08', api)).resolves.toEqual(classDetailFixture)
    await expect(teacherCoursesApi.saveClass(12, '2026-09-08', { temaDesarrollado: 'Ecuaciones', asistencias: [] }, api))
      .resolves.toEqual(classSaveFixture)
    await expect(teacherCoursesApi.getAcademicSummary(12, api)).resolves.toEqual(academicSummaryFixture)
  })
})
