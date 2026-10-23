import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/core/api/errors'
import AdminCourseGradesView from './AdminCourseGradesView.vue'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  listStudents: vi.fn(),
  listGrades: vi.fn(),
  saveGrades: vi.fn(),
  listHistoricalCandidates: vi.fn(),
  enrollHistoricalCourse: vi.fn(),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

vi.mock('@/core/api/client', () => ({ apiClient: { get: mocks.get } }))
vi.mock('@/modules/admin/api/adminApi', () => ({ adminApi: { enrollHistoricalCourse: mocks.enrollHistoricalCourse } }))
vi.mock('@/modules/adminAcademicRecords/api/adminAcademicRecordsApi', () => ({ fetchAdminStudents: mocks.listHistoricalCandidates }))
vi.mock('@/modules/teacherCourses/api/teacherCoursesApi', () => ({
  teacherCoursesApi: {
    listStudents: mocks.listStudents,
    listGrades: mocks.listGrades,
    saveGrades: mocks.saveGrades,
  },
}))

describe('AdminCourseGradesView', () => {
  const course = {
    cursadaId: 1,
    anioLectivo: 2024,
    materia: { id: 8, nombre: 'Historia', carrera: { id: 4, nombre: 'Profesorado' } },
    espacioCurricular: { id: 9, nombre: 'Práctica profesional' },
  }
  const students = [
    { alumnoId: 31, apellidoNombre: 'Alumna Uno', dni: 11111111, email: 'uno@example.test' },
    { alumnoId: 32, apellidoNombre: 'Alumno Dos', dni: 22222222, email: 'dos@example.test' },
  ]
  const grade = (alumnoId: number, apellidoNombre: string, dni: number, overrides: Record<string, unknown> = {}) => ({
    id: alumnoId,
    cursadaId: 1,
    tipoCalificacion: 'PARCIAL' as const,
    numero: 1,
    nota: 8,
    fechaEvaluacion: '2024-04-01',
    parcialOriginalId: null,
    observacion: null,
    alumno: { alumnoId, apellidoNombre, dni },
    ...overrides,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.get.mockResolvedValue([course])
    mocks.listStudents.mockResolvedValue(students)
    mocks.listGrades.mockResolvedValue([])
    mocks.saveGrades.mockResolvedValue({ registros: 1 })
    mocks.listHistoricalCandidates.mockResolvedValue({ data: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } })
    mocks.enrollHistoricalCourse.mockResolvedValue({ message: 'Se agregó el alumno a la cursada.' })
  })

  async function selectCourse() {
    const courseSelect = await screen.findByRole('combobox', { name: 'Cursada' })
    await waitFor(() => expect(courseSelect.querySelector('option[value="1"]')).not.toBeNull())
    expect(courseSelect.querySelector('option[value="1"]')).toHaveTextContent(/Historia · \d{4} · Profesorado · Espacio: Práctica profesional/)
    await fireEvent.update(courseSelect, '1')
    await screen.findByRole('combobox', { name: 'Alumno' })
  }

  it('loads grades only after an enrolled student is selected and displays that student only', async () => {
    mocks.listGrades.mockResolvedValue([
      grade(31, 'Alumna Uno', 11111111),
      grade(31, 'Alumna Uno', 11111111, { id: 131, tipoCalificacion: 'RECUPERATORIO', nota: 9, fechaEvaluacion: '2024-04-10', parcialOriginalId: 31 }),
      grade(32, 'Alumno Dos', 22222222),
    ])

    render(AdminCourseGradesView)
    await selectCourse()

    expect(mocks.listStudents).toHaveBeenCalledWith(1)
    expect(mocks.listGrades).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: 'Calificaciones' })).not.toBeInTheDocument()

    await fireEvent.update(screen.getByRole('combobox', { name: 'Alumno' }), '31')

    await waitFor(() => {
      expect(mocks.listGrades).toHaveBeenCalledWith(1, { alumnoId: 31 })
    })
    expect(await screen.findByText('Alumna Uno')).toBeInTheDocument()
    expect(screen.queryByText('Alumno Dos')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Nota')).toHaveValue(8)
    expect(screen.getByLabelText('Fecha de evaluación')).toHaveValue('2024-04-01')

    await fireEvent.update(screen.getByLabelText('Tipo de evaluación'), 'RECUPERATORIO')
    await waitFor(() => expect(screen.getByLabelText('Nota')).toHaveValue(9))
    expect(screen.getByLabelText('Fecha de evaluación')).toHaveValue('2024-04-10')
  })

  it('discards an older student response when selection changes before it resolves', async () => {
    const first = deferred<ReturnType<typeof grade>[]>()
    const second = deferred<ReturnType<typeof grade>[]>()
    mocks.listGrades.mockImplementation((_courseId: number, filters?: { alumnoId?: number }) => filters?.alumnoId === 31 ? first.promise : second.promise)
    render(AdminCourseGradesView)
    await selectCourse()
    const studentSelect = screen.getByRole('combobox', { name: 'Alumno' })

    await fireEvent.update(studentSelect, '31')
    await waitFor(() => expect(mocks.listGrades).toHaveBeenCalledWith(1, { alumnoId: 31 }))
    await fireEvent.update(studentSelect, '32')
    await waitFor(() => expect(mocks.listGrades).toHaveBeenCalledWith(1, { alumnoId: 32 }))

    second.resolve([grade(32, 'Alumno Dos', 22222222)])
    expect(await screen.findByText('Alumno Dos')).toBeInTheDocument()
    first.resolve([grade(31, 'Alumna Uno', 11111111)])

    await waitFor(() => expect(screen.queryByText('Alumna Uno')).not.toBeInTheDocument())
    expect(screen.getByText('Alumno Dos')).toBeInTheDocument()
  })

  it('saves and refreshes only the selected student while keeping historical editing enabled', async () => {
    mocks.listGrades.mockResolvedValueOnce([]).mockResolvedValueOnce([grade(31, 'Alumna Uno', 11111111)])
    render(AdminCourseGradesView)
    await selectCourse()
    await fireEvent.update(screen.getByRole('combobox', { name: 'Alumno' }), '31')
    await screen.findByRole('heading', { name: 'Calificaciones' })
    await fireEvent.update(screen.getByLabelText('Fecha de evaluación'), '2024-04-01')
    await fireEvent.update(screen.getByLabelText('Nota'), '8')
    await fireEvent.click(screen.getByRole('button', { name: 'Guardar calificaciones' }))

    await waitFor(() => expect(mocks.saveGrades).toHaveBeenCalledWith({
      cursadaId: 1,
      calificaciones: [expect.objectContaining({ alumnoId: 31, nota: 8, tipoCalificacion: 'PARCIAL', fechaEvaluacion: '2024-04-01' })],
    }))
    expect(mocks.listGrades).toHaveBeenLastCalledWith(1, { alumnoId: 31 })
    expect(await screen.findByRole('status')).toHaveTextContent('Las calificaciones se guardaron.')
  })

  it('adds a searched student from the course career, selects them, and loads only their grades', async () => {
    const candidate = { idUsuario: 33, apellidoNombre: 'Alumna Histórica', dni: '33333333', activo: false }
    mocks.listStudents.mockResolvedValueOnce(students).mockResolvedValueOnce([...students, { alumnoId: 33, apellidoNombre: candidate.apellidoNombre, dni: candidate.dni, email: '' }])
    mocks.listHistoricalCandidates.mockResolvedValue({ data: [candidate], pagination: { page: 1, limit: 50, total: 1, totalPages: 1 } })
    render(AdminCourseGradesView)
    await selectCourse()

    await fireEvent.update(screen.getByLabelText('Buscar por nombre o DNI'), 'Alumna Histórica')
    await fireEvent.click(screen.getByRole('button', { name: 'Buscar alumnos' }))
    await screen.findByRole('option', { name: /Alumna Histórica · DNI 33333333 · cuenta inactiva/ })
    expect(mocks.listHistoricalCandidates).toHaveBeenCalledWith({ search: 'Alumna Histórica', carreraId: 4, limit: 50 })

    await fireEvent.update(screen.getByRole('combobox', { name: 'Alumno para agregar' }), '33')
    await fireEvent.click(screen.getByRole('button', { name: 'Agregar a la nómina' }))

    await waitFor(() => expect(mocks.enrollHistoricalCourse).toHaveBeenCalledWith(1, 33))
    expect(await screen.findByText('Se agregó el alumno a la cursada.', { selector: 'p' })).toBeInTheDocument()
    await waitFor(() => expect(mocks.listStudents).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(mocks.listGrades).toHaveBeenCalledWith(1, { alumnoId: 33 }))
    expect(screen.getByRole('combobox', { name: 'Alumno' })).toHaveValue('33')
  })

  it('preserves an incompatible historical enrollment conflict and refreshes the roster', async () => {
    mocks.enrollHistoricalCourse.mockRejectedValue(new ApiError('El alumno ya pertenece a la cursada.', 409))
    mocks.listHistoricalCandidates.mockResolvedValue({
      data: [{ idUsuario: 33, apellidoNombre: 'Alumna Histórica', dni: '33333333', activo: true }],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    })
    render(AdminCourseGradesView)
    await selectCourse()
    await fireEvent.update(screen.getByLabelText('Buscar por nombre o DNI'), 'Alumna Histórica')
    await fireEvent.click(screen.getByRole('button', { name: 'Buscar alumnos' }))
    await screen.findByRole('option', { name: /Alumna Histórica/ })
    await fireEvent.update(screen.getByRole('combobox', { name: 'Alumno para agregar' }), '33')
    await fireEvent.click(screen.getByRole('button', { name: 'Agregar a la nómina' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('El alumno ya pertenece a la cursada.')
    await waitFor(() => expect(mocks.listStudents).toHaveBeenCalledTimes(2))
  })

  it('adds a roster refresh notice only when a 409 reload shows that the student is enrolled', async () => {
    mocks.enrollHistoricalCourse.mockRejectedValue(new ApiError('La cursada no admite nuevas inscripciones.', 409))
    mocks.listStudents.mockResolvedValueOnce(students).mockResolvedValueOnce([...students, { alumnoId: 33, apellidoNombre: 'Alumna Histórica', dni: '33333333', email: '' }])
    mocks.listHistoricalCandidates.mockResolvedValue({
      data: [{ idUsuario: 33, apellidoNombre: 'Alumna Histórica', dni: '33333333', activo: true }],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    })
    render(AdminCourseGradesView)
    await selectCourse()
    await fireEvent.update(screen.getByLabelText('Buscar por nombre o DNI'), 'Alumna Histórica')
    await fireEvent.click(screen.getByRole('button', { name: 'Buscar alumnos' }))
    await screen.findByRole('option', { name: /Alumna Histórica/ })
    await fireEvent.update(screen.getByRole('combobox', { name: 'Alumno para agregar' }), '33')
    await fireEvent.click(screen.getByRole('button', { name: 'Agregar a la nómina' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('La cursada no admite nuevas inscripciones. La nómina se actualizó y el alumno ya figura en la cursada.')
  })

  it('keeps the historical roster action hidden for the institutional year', async () => {
    mocks.get.mockResolvedValue([{ ...course, anioLectivo: new Date().getFullYear() }])
    render(AdminCourseGradesView)
    await selectCourse()

    expect(screen.queryByText('Agregar alumno a la cursada histórica')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Buscar alumnos' })).not.toBeInTheDocument()
  })

})
