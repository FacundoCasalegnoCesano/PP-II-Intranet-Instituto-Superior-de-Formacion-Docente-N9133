import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { defineComponent, h, nextTick, reactive } from 'vue'
import type { Component } from 'vue'
import type { AcademicSummary, GradeRecord, TeacherCourse, TeacherCourseListResult, TeacherCourseSection } from '../types/teacherCourses'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  listStudents: vi.fn(),
  listClasses: vi.fn(),
  listGrades: vi.fn(),
  saveGrades: vi.fn(),
  getAcademicSummary: vi.fn(),
  getClass: vi.fn(),
  saveClass: vi.fn(),
  push: vi.fn(),
  route: { name: 'teacher-courses', params: {}, query: {} as Record<string, string>, fullPath: '/profesor/cursadas' },
}))

vi.mock('../api/teacherCoursesApi', () => ({
  teacherCoursesApi: {
    list: mocks.list,
    get: mocks.get,
    listStudents: mocks.listStudents,
    listClasses: mocks.listClasses,
    listGrades: mocks.listGrades,
    saveGrades: mocks.saveGrades,
    getAcademicSummary: mocks.getAcademicSummary,
    getClass: mocks.getClass,
    saveClass: mocks.saveClass,
  },
}))

vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: mocks.push }),
  RouterLink: defineComponent({
    props: { to: { type: Object, required: true } },
    setup(props, { slots }) {
      return () => h('a', {
        href: '#',
        onClick: (event: MouseEvent) => {
          event.preventDefault()
          void mocks.push(props.to)
        },
      }, slots.default?.())
    },
  }),
}))

import TeacherCoursesView from './TeacherCoursesView.vue'

mocks.route = reactive(mocks.route)

const RouterLinkStub = defineComponent({
  props: { to: { type: Object, required: true } },
  setup(props, { slots }) {
    return () => h('a', {
      href: '#',
      onClick: (event: MouseEvent) => {
        event.preventDefault()
        void mocks.push(props.to)
      },
    }, slots.default?.())
  },
})

function course(id: number, anioLectivo: number, editable?: boolean, nombre = `Materia ${id}`): TeacherCourse {
  return {
    id,
    materia: { id: id + 100, nombre, carrera: { id: 3, nombre: 'Profesorado de Educación Primaria' }, curso: { id: 10, anio: 2 } },
    anioLectivo,
    periodo: 'ANUAL',
    docenteId: 12,
    docente: { idUsuario: 12, apellidoNombre: 'Jorge Test', email: 'jorge@example.test' },
    horarios: [],
    activo: true,
    ...(editable === undefined ? {} : { editable }),
  }
}

function result(data: TeacherCourse[]): TeacherCourseListResult {
  return { data, pagination: { page: 1, limit: 20, total: data.length, totalPages: 1 } }
}

const gradeFixture: GradeRecord = {
  id: 101,
  cursadaId: 12,
  tipoCalificacion: 'PARCIAL',
  numero: 1,
  nota: 8,
  fechaEvaluacion: '2026-04-10',
  parcialOriginalId: null,
  observacion: 'Muy buen trabajo',
  alumno: { alumnoId: 13, apellidoNombre: 'Lucia Test', dni: 42666888 },
}

const academicSummaryFixture: AcademicSummary = {
  cursadaId: 12,
  materia: { id: 112, nombre: 'Materia 12' },
  anioLectivo: new Date().getFullYear(),
  periodo: 'ANUAL',
  alumnos: [{
    alumno: { alumnoId: 13, apellidoNombre: 'Lucia Test', dni: 42666888 },
    asistencia: { porcentaje: 90, requerido: 75, cumpleRegularidad: true },
    parcialesEfectivos: [{ numero: 1, notaOriginal: 8, notaEfectiva: 8, recuperado: false }],
    tps: { cargados: 1, aprobados: 1, porcentaje: 100, requerido: 75, cumple: true },
    promedio: 8,
    notaMinima: 6,
    estado: 'REGULAR',
    requisitosPendientes: [],
  }],
}

function renderView() {
  return render(TeacherCoursesView as Component, {
    global: { components: { RouterLink: RouterLinkStub } },
  })
}

beforeEach(() => {
  mocks.list.mockReset()
  mocks.get.mockReset()
  mocks.listStudents.mockReset()
  mocks.listClasses.mockReset()
  mocks.listGrades.mockReset()
  mocks.saveGrades.mockReset().mockResolvedValue({ registros: 0 })
  mocks.getAcademicSummary.mockReset()
  mocks.getClass.mockReset()
  mocks.saveClass.mockReset()
  mocks.push.mockReset()
  mocks.route.name = 'teacher-courses'
  mocks.route.params = {}
  mocks.route.query = {}
  mocks.route.fullPath = '/profesor/cursadas'
  mocks.push.mockImplementation(async (target: { name: string; params?: Record<string, string>; query?: Record<string, string> }) => {
    mocks.route.name = target.name
    mocks.route.params = target.params ?? {}
    mocks.route.query = target.query ?? {}
    mocks.route.fullPath = `/profesor/cursadas${target.params?.id ? `/${target.params.id}` : ''}${Object.keys(mocks.route.query).length ? `?${new URLSearchParams(mocks.route.query).toString()}` : ''}`
  })
})

describe('TeacherCoursesView', () => {
  it('starts with the current institutional year and shows current and historical text', async () => {
    mocks.list.mockResolvedValue(result([course(1, new Date().getFullYear(), true), course(2, new Date().getFullYear() - 1, false)]))

    renderView()

    expect((await screen.findAllByText('Materia 1'))[0]).toBeVisible()
    expect(mocks.list).toHaveBeenCalledWith({ anioLectivo: new Date().getFullYear() })
    expect((screen.getAllByText(/Cursada actual/i))[0]).toBeVisible()
    expect((screen.getAllByText(/Cursada histórica/i))[0]).toBeVisible()
  })

  it('offers historical years, empty/error/retry states, and no enrollment actions', async () => {
    mocks.list.mockResolvedValueOnce(result([])).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(result([course(3, 2024, false)]))
    const user = userEvent.setup()

    renderView()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('No hay cursadas para el año seleccionado.'))
    await user.selectOptions(screen.getByLabelText('Año lectivo'), '2024')
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar las cursadas.')
    expect(mocks.list).toHaveBeenCalledTimes(2)
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect((await screen.findAllByText('Materia 3'))[0]).toBeVisible()
    expect(screen.queryByText(/inscribir|dar de baja/i)).not.toBeInTheDocument()
  })

  it('uses the URL section and loads students for the selected course', async () => {
    mocks.route.name = 'teacher-course-students'
    mocks.route.params = { id: '12' }
    mocks.get.mockResolvedValue(course(12, new Date().getFullYear(), true))
    mocks.listStudents.mockResolvedValue([{ alumnoId: 13, apellidoNombre: 'Lucia Test', dni: 42666888, email: 'lucia@example.test' }])

    renderView()

    expect((await screen.findAllByText('Lucia Test'))[0]).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Alumnos inscriptos' })).toBeVisible()
    expect(screen.getAllByText('Clases').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Calificaciones').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Resumen').length).toBeGreaterThan(0)
  })

  it('loads public students and class history together for the classes section', async () => {
    mocks.route.name = 'teacher-course-classes'
    mocks.route.params = { id: '12' }
    mocks.route.fullPath = '/profesor/cursadas/12/clases'
    mocks.get.mockResolvedValue(course(12, new Date().getFullYear(), true))
    mocks.listStudents.mockResolvedValue([{ alumnoId: 13, apellidoNombre: 'Lucia Test', dni: 42666888, email: 'lucia@example.test' }])
    mocks.listClasses.mockResolvedValue([{ fecha: '2026-09-08', temaDesarrollado: 'Ecuaciones', presentes: 1, ausentes: 0, ausentesJustificados: 0 }])

    renderView()

    expect((await screen.findAllByText('Ecuaciones'))[0]).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Clases' })).toBeVisible()
    expect(screen.queryByText(/se habilitarán en las próximas tareas/i)).not.toBeInTheDocument()
    expect(mocks.listStudents).toHaveBeenCalledWith(12)
    expect(mocks.listClasses).toHaveBeenCalledWith(12)
  })

  it('loads the grades grid with enrolled students and existing grades', async () => {
    mocks.route.name = 'teacher-course-grades'
    mocks.route.params = { id: '12' }
    mocks.route.fullPath = '/profesor/cursadas/12/calificaciones'
    mocks.get.mockResolvedValue(course(12, new Date().getFullYear(), true))
    mocks.listStudents.mockResolvedValue([{ alumnoId: 13, apellidoNombre: 'Lucia Test', dni: 42666888, email: 'lucia@example.test' }])
    mocks.listGrades.mockResolvedValue([gradeFixture])

    renderView()

    expect((await screen.findAllByText('Lucia Test'))[0]).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Calificaciones' })).toBeVisible()
    expect(screen.getByLabelText('Nota')).toHaveValue(8)
    expect(mocks.listGrades).toHaveBeenCalledWith(12)
  })

  it('loads the backend-only academic summary and leaves it read-only', async () => {
    mocks.route.name = 'teacher-course-summary'
    mocks.route.params = { id: '12' }
    mocks.route.fullPath = '/profesor/cursadas/12/resumen'
    mocks.get.mockResolvedValue(course(12, new Date().getFullYear(), true))
    mocks.getAcademicSummary.mockResolvedValue(academicSummaryFixture)

    renderView()

    expect((await screen.findAllByText('Lucia Test'))[0]).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Resumen académico' })).toBeVisible()
    expect(screen.getByText('Regular')).toBeVisible()
    expect(screen.queryByRole('button', { name: /guardar calificaciones/i })).not.toBeInTheDocument()
    expect(mocks.getAcademicSummary).toHaveBeenCalledWith(12)
  })

  it('shows grade loading errors and retries the real request', async () => {
    mocks.route.name = 'teacher-course-grades'
    mocks.route.params = { id: '12' }
    mocks.route.fullPath = '/profesor/cursadas/12/calificaciones'
    mocks.get.mockResolvedValue(course(12, new Date().getFullYear(), true))
    mocks.listStudents.mockResolvedValue([{ alumnoId: 13, apellidoNombre: 'Lucia Test', dni: 42666888, email: 'lucia@example.test' }])
    mocks.listGrades.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([gradeFixture])
    const user = userEvent.setup()

    renderView()

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar la cursada seleccionada.')
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByLabelText('Nota')).toHaveValue(8)
    expect(mocks.listGrades).toHaveBeenCalledTimes(2)
  })

  it('shows an empty backend summary without inventing academic states', async () => {
    mocks.route.name = 'teacher-course-summary'
    mocks.route.params = { id: '12' }
    mocks.route.fullPath = '/profesor/cursadas/12/resumen'
    mocks.get.mockResolvedValue(course(12, new Date().getFullYear(), false))
    mocks.getAcademicSummary.mockResolvedValue({ ...academicSummaryFixture, alumnos: [] })

    renderView()

    expect(await screen.findByText('No hay alumnos para resumir.')).toHaveAttribute('role', 'status')
    expect(screen.queryByText('En curso')).not.toBeInTheDocument()
  })

  it('shows summary errors and retries the backend summary request', async () => {
    mocks.route.name = 'teacher-course-summary'
    mocks.route.params = { id: '12' }
    mocks.route.fullPath = '/profesor/cursadas/12/resumen'
    mocks.get.mockResolvedValue(course(12, new Date().getFullYear(), true))
    mocks.getAcademicSummary.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(academicSummaryFixture)
    const user = userEvent.setup()

    renderView()

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar la cursada seleccionada.')
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Regular')).toBeVisible()
    expect(mocks.getAcademicSummary).toHaveBeenCalledTimes(2)
  })

  it('discards a stale grade response after changing the selected course', async () => {
    mocks.route.name = 'teacher-course-grades'
    mocks.route.params = { id: '12' }
    mocks.route.fullPath = '/profesor/cursadas/12/calificaciones'
    mocks.get.mockResolvedValueOnce(course(12, new Date().getFullYear(), true)).mockResolvedValueOnce(course(13, new Date().getFullYear(), true))
    mocks.listStudents.mockResolvedValueOnce([{ alumnoId: 13, apellidoNombre: 'Lucia Test', dni: 42666888, email: 'lucia@example.test' }]).mockResolvedValueOnce([{ alumnoId: 22, apellidoNombre: 'Alumno nuevo', dni: 40111222, email: 'nuevo@example.test' }])
    let resolveFirst!: (grades: GradeRecord[]) => void
    mocks.listGrades.mockReturnValueOnce(new Promise<GradeRecord[]>(resolve => { resolveFirst = resolve })).mockResolvedValueOnce([])
    renderView()
    await waitFor(() => expect(mocks.listGrades).toHaveBeenCalledWith(12))
    await mocks.push({ name: 'teacher-course-grades', params: { id: '13' } })
    await waitFor(() => expect(screen.getByText('Alumno nuevo')).toBeVisible())
    resolveFirst([gradeFixture])

    await waitFor(() => expect(screen.getByText(/Solicitudes obsoletas descartadas: 1/)).toBeVisible())
    expect(screen.queryByText('Lucia Test')).not.toBeInTheDocument()
    expect(mocks.saveGrades).not.toHaveBeenCalled()
  })

  it('sends grade batches emitted by the grid to the approved API', async () => {
    mocks.route.name = 'teacher-course-grades'
    mocks.route.params = { id: '12' }
    mocks.route.fullPath = '/profesor/cursadas/12/calificaciones'
    mocks.get.mockResolvedValue(course(12, new Date().getFullYear(), true))
    mocks.listStudents.mockResolvedValue([{ alumnoId: 13, apellidoNombre: 'Lucia Test', dni: 42666888, email: 'lucia@example.test' }])
    mocks.listGrades.mockResolvedValue([])
    const user = userEvent.setup()

    renderView()
    await screen.findByRole('heading', { name: 'Calificaciones' })
    fireEvent.update(screen.getByLabelText('Número de evaluación'), '1')
    await nextTick()
    fireEvent.update(screen.getByLabelText('Fecha de evaluación'), '2026-09-10')
    fireEvent.update(screen.getByLabelText('Nota'), '9')
    await user.click(screen.getByRole('button', { name: 'Guardar calificaciones' }))

    await waitFor(() => expect(mocks.saveGrades).toHaveBeenCalledWith({
      cursadaId: 12,
      calificaciones: [{
        alumnoId: 13,
        tipoCalificacion: 'PARCIAL',
        numero: 1,
        fechaEvaluacion: '2026-09-10',
        nota: 9,
        observacion: null,
      }],
    }))
  })

  it('discards a stale grade refresh that resolves after the course changes', async () => {
    mocks.route.name = 'teacher-course-grades'
    mocks.route.params = { id: '12' }
    mocks.route.fullPath = '/profesor/cursadas/12/calificaciones'
    mocks.get.mockResolvedValueOnce(course(12, new Date().getFullYear(), true)).mockResolvedValueOnce(course(13, new Date().getFullYear(), true))
    mocks.listStudents.mockResolvedValueOnce([{ alumnoId: 13, apellidoNombre: 'Lucia Test', dni: 42666888, email: 'lucia@example.test' }]).mockResolvedValueOnce([{ alumnoId: 22, apellidoNombre: 'Alumno nuevo', dni: 40111222, email: 'nuevo@example.test' }])
    let resolveRefresh!: (grades: GradeRecord[]) => void
    mocks.listGrades
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(new Promise<GradeRecord[]>(resolve => { resolveRefresh = resolve }))
      .mockResolvedValueOnce([])
    const user = userEvent.setup()

    renderView()
    await screen.findByRole('heading', { name: 'Calificaciones' })
    fireEvent.update(screen.getByLabelText('Número de evaluación'), '1')
    await nextTick()
    fireEvent.update(screen.getByLabelText('Fecha de evaluación'), '2026-09-10')
    fireEvent.update(screen.getByLabelText('Nota'), '9')
    await user.click(screen.getByRole('button', { name: 'Guardar calificaciones' }))
    await waitFor(() => expect(mocks.listGrades).toHaveBeenCalledTimes(2))

    await mocks.push({ name: 'teacher-course-grades', params: { id: '13' } })
    await waitFor(() => expect(screen.getByText('Alumno nuevo')).toBeVisible())
    resolveRefresh([gradeFixture])

    await waitFor(() => expect(screen.getByText(/Solicitudes obsoletas descartadas: 1/)).toBeVisible())
    expect(screen.getByText('No hay calificaciones cargadas todavía. Podés cargar la primera evaluación.')).toBeVisible()
  })

  it('separates a successful save from a failed grade refresh and offers retry', async () => {
    mocks.route.name = 'teacher-course-grades'
    mocks.route.params = { id: '12' }
    mocks.route.fullPath = '/profesor/cursadas/12/calificaciones'
    mocks.get.mockResolvedValue(course(12, new Date().getFullYear(), true))
    mocks.listStudents.mockResolvedValue([{ alumnoId: 13, apellidoNombre: 'Lucia Test', dni: 42666888, email: 'lucia@example.test' }])
    mocks.listGrades.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('refresh offline')).mockResolvedValueOnce([gradeFixture])
    const user = userEvent.setup()

    renderView()
    await screen.findByRole('heading', { name: 'Calificaciones' })
    fireEvent.update(screen.getByLabelText('Número de evaluación'), '1')
    await nextTick()
    fireEvent.update(screen.getByLabelText('Fecha de evaluación'), '2026-09-10')
    fireEvent.update(screen.getByLabelText('Nota'), '9')
    await user.click(screen.getByRole('button', { name: 'Guardar calificaciones' }))

    await waitFor(() => expect(mocks.saveGrades).toHaveBeenCalled())
    expect(await screen.findByRole('alert')).toHaveTextContent(/se guardaron.*no pudimos actualizar la vista/i)
    expect(screen.getByRole('button', { name: 'Reintentar actualización' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Reintentar actualización' }))
    await waitFor(() => expect(screen.getByLabelText('Nota')).toHaveValue(8))
    expect(mocks.saveGrades).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['clases', 'teacher-course-classes', 'Ver clases'],
    ['calificaciones', 'teacher-course-grades', 'Ver calificaciones'],
    ['resumen', 'teacher-course-summary', 'Ver resumen'],
  ] as Array<[TeacherCourseSection, string, string]>)('maps ?seccion=%s to %s from the list', async (section, routeName, label) => {
    mocks.route.query = { seccion: section }
    mocks.route.fullPath = `/profesor/cursadas?seccion=${section}`
    mocks.list.mockResolvedValue(result([course(18, new Date().getFullYear(), true)]))
    mocks.get.mockResolvedValue(course(18, new Date().getFullYear(), true))
    const user = userEvent.setup()

    renderView()
    await user.click((await screen.findAllByRole('button', { name: label }))[0])

    expect(mocks.push).toHaveBeenCalledWith({ name: routeName, params: { id: 18 }, query: { anioLectivo: String(new Date().getFullYear()) } })
  })

  it('preserves the historical year when selecting a course', async () => {
    mocks.route.query = { anioLectivo: '2024' }
    mocks.route.fullPath = '/profesor/cursadas?anioLectivo=2024'
    mocks.list.mockResolvedValue(result([course(19, 2024, false)]))
    const user = userEvent.setup()

    renderView()
    await user.click((await screen.findAllByRole('button', { name: 'Ver alumnos' }))[0])

    expect(mocks.push).toHaveBeenCalledWith({
      name: 'teacher-course-students',
      params: { id: 19 },
      query: { anioLectivo: '2024' },
    })
  })

  it('preserves only anioLectivo while navigating between course sections', async () => {
    mocks.route.name = 'teacher-course-students'
    mocks.route.params = { id: '12' }
    mocks.route.query = { anioLectivo: '2024', basura: 'no-preservar' }
    mocks.route.fullPath = '/profesor/cursadas/12/alumnos?anioLectivo=2024&basura=no-preservar'
    mocks.get.mockResolvedValue(course(12, 2024, false))
    mocks.listStudents.mockResolvedValue([])
    const user = userEvent.setup()

    renderView()
    await screen.findByText('Materia 12')
    await user.click(screen.getByRole('link', { name: 'Clases' }))

    expect(mocks.push).toHaveBeenCalledWith({
      name: 'teacher-course-classes',
      params: { id: 12 },
      query: { anioLectivo: '2024' },
    })
  })

  it('restores the current year when anioLectivo is removed and loads once', async () => {
    const currentYear = new Date().getFullYear()
    mocks.route.query = { anioLectivo: '2024' }
    mocks.route.fullPath = '/profesor/cursadas?anioLectivo=2024'
    mocks.list
      .mockResolvedValueOnce(result([course(20, 2024, false)]))
      .mockResolvedValueOnce(result([course(21, currentYear, true)]))

    renderView()
    expect((await screen.findAllByText('Materia 20'))[0]).toBeVisible()
    await mocks.push({ name: 'teacher-courses', query: {} })

    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2))
    expect(mocks.list).toHaveBeenLastCalledWith({ anioLectivo: currentYear })
    expect((await screen.findAllByText('Materia 21'))[0]).toBeVisible()
  })

  it.each([
    [new Date().getFullYear(), undefined, 'Cursada actual', 'text-[var(--color-brand)]'],
    [new Date().getFullYear() - 1, false, 'Cursada histórica', 'text-[var(--color-graphite)]'],
  ] as Array<[number, boolean | undefined, string, string]>)('uses courseIsCurrent for detail status: %s', async (year, editable, label, className) => {
    mocks.route.name = 'teacher-course-students'
    mocks.route.params = { id: '12' }
    mocks.route.fullPath = '/profesor/cursadas/12/alumnos'
    mocks.get.mockResolvedValue(course(12, year, editable))
    mocks.listStudents.mockResolvedValue([])

    renderView()

    const status = await screen.findByText(label)
    expect(status).toHaveClass(className)
  })

  it('does not let an old students response replace the newly selected course', async () => {
    mocks.route.name = 'teacher-course-students'
    mocks.route.params = { id: '12' }
    mocks.route.fullPath = '/profesor/cursadas/12/alumnos'
    mocks.get.mockResolvedValueOnce(course(12, new Date().getFullYear(), true)).mockResolvedValueOnce(course(13, new Date().getFullYear(), true))
    let resolveFirst!: (students: Array<{ alumnoId: number; apellidoNombre: string; dni: number; email: string }>) => void
    const firstStudents = new Promise<Array<{ alumnoId: number; apellidoNombre: string; dni: number; email: string }>>(resolve => { resolveFirst = resolve })
    mocks.listStudents.mockReturnValueOnce(firstStudents).mockResolvedValueOnce([{ alumnoId: 22, apellidoNombre: 'Alumno nuevo', dni: 40111223, email: 'nuevo@example.test' }])

    renderView()
    await waitFor(() => expect(mocks.listStudents).toHaveBeenCalledWith(12))
    await mocks.push({ name: 'teacher-course-students', params: { id: '13' } })
    await waitFor(() => expect(mocks.listStudents).toHaveBeenCalledWith(13))
    expect(screen.getAllByText('Alumno nuevo')[0]).toBeVisible()

    resolveFirst([{ alumnoId: 21, apellidoNombre: 'Alumno antiguo', dni: 40111222, email: 'antiguo@example.test' }])

    await waitFor(() => expect(screen.getByText(/Solicitudes obsoletas descartadas: 1/)).toBeVisible())
    expect(screen.queryByText('Alumno antiguo')).not.toBeInTheDocument()
  })

  it('counts and discards a stale course response', async () => {
    let resolveFirst!: (value: TeacherCourseListResult) => void
    const first = new Promise<TeacherCourseListResult>((resolve) => { resolveFirst = resolve })
    mocks.list.mockImplementationOnce(() => first).mockResolvedValueOnce(result([course(4, 2024, false)]))
    const user = userEvent.setup()

    renderView()
    await user.selectOptions(screen.getByLabelText('Año lectivo'), '2024')
    expect((await screen.findAllByText('Materia 4'))[0]).toBeVisible()
    resolveFirst(result([course(5, new Date().getFullYear(), true)]))

    await waitFor(() => expect(screen.getByText(/Solicitudes obsoletas descartadas: 1/)).toBeVisible())
    expect(screen.queryByText('Materia 5')).not.toBeInTheDocument()
  })
})
