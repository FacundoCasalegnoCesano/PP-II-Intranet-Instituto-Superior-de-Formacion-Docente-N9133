import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { RouterView } from 'vue-router'
import AdminCoursesView from './AdminCoursesView.vue'

const mocks = vi.hoisted(() => ({
  listSubjects: vi.fn(),
  listUsers: vi.fn(),
  listCourses: vi.fn(),
  getCourse: vi.fn(),
  createCourse: vi.fn(),
  updateCourse: vi.fn(),
  deactivateCourse: vi.fn(),
  listSpaceCourses: vi.fn(),
  createSpaceCourse: vi.fn(),
  getSpaceCourse: vi.fn(),
  listActiveStudents: vi.fn(),
  enrollHistoricalCourse: vi.fn(),
  enrollHistoricalSpaceCourse: vi.fn(),
  listCareers: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock('../api/adminApi', () => ({
  adminApi: {
    listSubjects: mocks.listSubjects,
    listUsers: mocks.listUsers,
    listCourses: mocks.listCourses,
    getCourse: mocks.getCourse,
    createCourse: mocks.createCourse,
    updateCourse: mocks.updateCourse,
    deactivateCourse: mocks.deactivateCourse,
    listSpaceCourses: mocks.listSpaceCourses,
    createSpaceCourse: mocks.createSpaceCourse,
    getSpaceCourse: mocks.getSpaceCourse,
    listActiveStudents: mocks.listActiveStudents,
    enrollHistoricalCourse: mocks.enrollHistoricalCourse,
    enrollHistoricalSpaceCourse: mocks.enrollHistoricalSpaceCourse,
    listCareers: mocks.listCareers,
  },
}))
const spaces = vi.hoisted(() => ({ list: vi.fn() }))
vi.mock('@/modules/spaces/api/spacesApi', () => ({ spacesApi: { list: spaces.list } }))

vi.mock('@/ui/feedback', () => ({ useFeedback: () => ({ success: mocks.success, error: mocks.error }) }))

function course(id: number, materiaId = 4, anioLectivo = 2026) {
  return {
    id,
    materiaId,
    materia: { id: materiaId, nombre: `Álgebra ${id}`, cargaHoraria: 96, tipoEspacio: 'ASIGNATURA', activo: true },
    anioLectivo,
    periodo: 'ANUAL',
    docenteId: null,
    activo: true,
  }
}

function createRouterAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app/administracion/cursadas', name: 'admin-courses', component: AdminCoursesView },
      { path: '/app/administracion/calificaciones-cursadas', name: 'admin-course-grades', component: AdminCoursesView },
      { path: '/app/administracion/cursadas/nueva', name: 'admin-course-create', component: AdminCoursesView },
      { path: '/app/administracion/cursadas/:id', name: 'admin-course-detail', component: AdminCoursesView },
      { path: '/app/administracion/cursadas/:id/editar', name: 'admin-course-edit', component: AdminCoursesView },
      { path: '/app/horarios', name: 'schedules', component: AdminCoursesView },
    ],
  })
  return router.push(path).then(() => router.isReady()).then(() => router)
}

async function renderAt(path: string, spaceList: unknown[] = [], teacherList: unknown[] = [], subjectList = [{ id: 4, nombre: 'Álgebra', carrera: { nombre: 'Profesorado' } }]) {
  mocks.listSubjects.mockResolvedValue({ data: subjectList })
  mocks.listUsers.mockResolvedValue({ data: teacherList })
  mocks.listCareers.mockResolvedValue({ data: [{ id: 2, nombre: 'Profesorado' }] })
  mocks.listSpaceCourses.mockResolvedValue({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } })
  mocks.listActiveStudents.mockResolvedValue({ data: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } })
  spaces.list.mockResolvedValue(spaceList)
  const router = await createRouterAt(path)
  const view = render(defineComponent({ render: () => h(RouterView) }), { global: { plugins: [router] } })
  return { router, ...view }
}

describe('AdminCoursesView', () => {
  it('keeps components of active spaces out of individual course creation', async () => {
    await renderAt('/app/administracion/cursadas/nueva', [{ id: 31, nombre: 'Formación docente', carreraId: 2, activo: true, materias: [{ id: 4, nombre: 'Álgebra' }] }], [], [{ id: 4, nombre: 'Álgebra', carrera: { nombre: 'Profesorado' } }, { id: 5, nombre: 'Didáctica', carrera: { nombre: 'Profesorado' } }])
    const subjectSelect = await screen.findByRole('combobox', { name: 'Materia' })
    expect(subjectSelect).toHaveTextContent('Didáctica')
    expect(subjectSelect).not.toHaveTextContent('Álgebra')
  })
  it('creates a space offering with component teachers and periods through the space endpoint', async () => {
    mocks.createSpaceCourse.mockResolvedValue({ id: 90 })
    await renderAt('/app/administracion/cursadas/nueva?tipo=ESPACIO', [{ id: 31, nombre: 'Formación docente', carreraId: 2, activo: true, materias: [{ id: 4, nombre: 'Álgebra' }, { id: 5, nombre: 'Didáctica' }] }], [{ idUsuario: 77, apellidoNombre: 'Docente Uno' }])
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Carrera' }), '2')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Espacio curricular' }), '31')
    const teachers = screen.getAllByRole('combobox', { name: 'Docente' })
    await userEvent.selectOptions(teachers[0], '77')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cursada' }))
    await waitFor(() => expect(mocks.createSpaceCourse).toHaveBeenCalledWith(expect.objectContaining({ espacioCurricularId: 31, anioLectivo: 2026, componentes: [{ materiaId: 4, docenteId: 77 }, { materiaId: 5, docenteId: null }] })))
  })
  it('enrolls a named student in a finalized course through the historical enrollment endpoint', async () => {
    mocks.getCourse.mockResolvedValue({ ...course(12), estadoCursada: 'FINALIZADA' })
    mocks.enrollHistoricalCourse.mockResolvedValue({ message: 'Inscripción histórica registrada.' })
    const user = userEvent.setup()
    await renderAt('/app/administracion/cursadas/12')
    mocks.listActiveStudents.mockResolvedValue({
      data: [{ idUsuario: 42, apellidoNombre: 'Lucía Fernández', dni: '42666888', email: 'lucia@example.test', activo: true, rol: 'ALUMNO' }],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    })

    expect(await screen.findByText(/Finalizada/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Buscar alumno'), 'Lucía')
    await screen.findByRole('option', { name: /Lucía Fernández/ })
    await user.selectOptions(screen.getByLabelText('Alumno'), '42')
    await user.click(screen.getByRole('button', { name: 'Inscribir alumno' }))

    await waitFor(() => expect(mocks.enrollHistoricalCourse).toHaveBeenCalledWith(12, 42))
    expect(await screen.findByRole('status')).toHaveTextContent('Inscripción histórica registrada.')
  })
  it('shows edit loading and error states, then retries without enabling incomplete saves', async () => {
    let failFirst!: (error: Error) => void
    mocks.getCourse.mockReturnValueOnce(new Promise((_, reject) => { failFirst = reject })).mockResolvedValueOnce(course(12))
    await renderAt('/app/administracion/cursadas/12/editar')

    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
    failFirst(new Error('offline'))
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar la cursada para editar.')
    expect(screen.queryByRole('button', { name: 'Guardar cursada' })).not.toBeInTheDocument()
    const callsBeforeRetry = mocks.getCourse.mock.calls.length
    await fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByLabelText('Año lectivo')).toHaveValue(2026)
    expect(mocks.getCourse).toHaveBeenCalledTimes(callsBeforeRetry + 1)
  })

  it('ignores an edit response after navigation to another course', async () => {
    let resolveFirst!: (value: ReturnType<typeof course>) => void
    const oldLoad = new Promise<ReturnType<typeof course>>((resolve) => { resolveFirst = resolve })
    mocks.getCourse.mockReturnValueOnce(oldLoad).mockResolvedValueOnce(course(13, 5, 2027))
    const { router } = await renderAt('/app/administracion/cursadas/12/editar')
    await waitFor(() => expect(mocks.getCourse).toHaveBeenCalledWith(12))

    await router.push('/app/administracion/cursadas/13/editar')
    expect(await screen.findByLabelText('Año lectivo')).toHaveValue(2027)
    resolveFirst(course(12, 4, 2026))
    await waitFor(() => expect(screen.getByLabelText('Año lectivo')).toHaveValue(2027))
  })

  it('keeps the edited draft after a failed save', async () => {
    mocks.getCourse.mockResolvedValue(course(12))
    mocks.updateCourse.mockRejectedValue(new Error('offline'))
    await renderAt('/app/administracion/cursadas/12/editar')

    const year = await screen.findByLabelText('Año lectivo')
    await fireEvent.update(year, '2028')
    await fireEvent.click(screen.getByRole('button', { name: 'Guardar cursada' }))

    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('No se pudo guardar la cursada.'))
    expect(year).toHaveValue(2028)
  })

  it('blocks duplicate deactivation and identifies the course in the confirmation', async () => {
    mocks.getCourse.mockResolvedValue(course(12))
    let finish!: () => void
    mocks.deactivateCourse.mockReturnValue(new Promise<void>((resolve) => { finish = resolve }))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await renderAt('/app/administracion/cursadas/12')
    const button = await screen.findByRole('button', { name: 'Desactivar' })

    await fireEvent.click(button)
    await fireEvent.click(button)

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Álgebra 12 · ciclo 2026'))
    expect(mocks.deactivateCourse).toHaveBeenCalledTimes(1)
    finish()
  })

  it('directs staff to the official published schedule without exposing the legacy schedule editor', async () => {
    mocks.listSubjects.mockResolvedValue({ data: [] })
    mocks.listUsers.mockResolvedValue({ data: [] })
    mocks.getCourse.mockResolvedValue({
      id: 12,
      materia: { id: 4, nombre: 'Álgebra', cargaHoraria: 96, tipoEspacio: 'ASIGNATURA', activo: true },
      anioLectivo: 2026,
      periodo: 'ANUAL',
      horarios: [{ id: 3, cursadaId: 12, dia: 'LUNES', horaInicio: '1970-01-01T08:00:00.000Z', horaFin: '1970-01-01T10:00:00.000Z', activo: true }],
      activo: true,
    })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/app/administracion/cursadas/:id', name: 'admin-course-detail', component: AdminCoursesView },
        { path: '/app/administracion/cursadas/:id/editar', name: 'admin-course-edit', component: AdminCoursesView },
        { path: '/app/horarios', name: 'schedules', component: AdminCoursesView },
      ],
    })
    await router.push('/app/administracion/cursadas/12')
    await router.isReady()

    render(defineComponent({ render: () => h(RouterView) }), { global: { plugins: [router] } })

    expect(await screen.findByRole('link', { name: 'Horarios oficiales' })).toHaveAttribute('href', '/app/horarios')
    expect(screen.queryByRole('button', { name: 'Agregar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Quitar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar horario' })).not.toBeInTheDocument()
    expect(screen.queryByText('LUNES · 08:00–10:00')).not.toBeInTheDocument()
  })
})
