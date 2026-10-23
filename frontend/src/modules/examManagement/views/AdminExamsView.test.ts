import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import AdminExamsView from './AdminExamsView.vue'

const api = vi.hoisted(() => ({
  listExamTables: vi.fn(), getExamWorkspace: vi.fn(), getExamTable: vi.fn(), listSubjectOptions: vi.fn(), listCareerOptions: vi.fn(), listTeacherOptions: vi.fn(),
  createExamTable: vi.fn(), updateExamTable: vi.fn(), assignTribunalMember: vi.fn(), removeTribunalMember: vi.fn(), reloadExamResults: vi.fn(), saveExamResult: vi.fn(), closeExamTable: vi.fn(), reopenExamTable: vi.fn(), enrollStudent: vi.fn(), withdrawStudent: vi.fn(),
}))
const adminApi = vi.hoisted(() => ({ listActiveStudents: vi.fn() }))
const historicalRoute = { path: '/app/administracion/mesas-historicas', name: 'admin-historical-exams', component: defineComponent({ render: () => h('div') }) }

vi.mock('../api/examsApi', () => api)
vi.mock('@/modules/admin/api/adminApi', () => ({ adminApi }))
vi.mock('@/ui/feedback', () => ({ useFeedback: () => ({ success: vi.fn(), error: vi.fn() }) }))

const mesa = {
  id: 9,
  materia: { id: 5, nombre: 'Pedagogía', carrera: { id: 2, nombre: 'Profesorado de Inicial' } },
  fecha: '2026-12-10T12:00:00.000Z',
  tipoExamen: 'ORAL',
  llamado: 2,
  estadoMesa: 'FINALIZADA',
  version: 4,
  publicadaEn: '2026-12-10T15:00:00.000Z',
  tribunales: [
    { id: 1, profesorId: 20, apellidoNombre: 'Ana Profesora', rolTribunal: 'PRESIDENTE' },
    { id: 2, profesorId: 21, apellidoNombre: 'Luis Profesor', rolTribunal: 'VOCAL' },
    { id: 3, profesorId: 22, apellidoNombre: 'Marta Profesora', rolTribunal: 'VOCAL' },
  ],
  _count: { inscripciones: 2 },
}

const editableMesa = { ...mesa, estadoMesa: 'EN_PROCESO', version: 4, publicadaEn: null }
const workspace = { detail: editableMesa, results: [] }
const enrolledWorkspace = {
  detail: editableMesa,
  results: [{ id: 21, alumno: { idUsuario: 13, apellidoNombre: 'Lucía Fernández' }, condicion: 'REGULAR', resultado: 'PENDIENTE', nota: null, aprobado: null, notaMinima: 6, ausente: false }],
}

beforeEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  api.listSubjectOptions.mockResolvedValue({ data: [{ id: 5, nombre: 'Pedagogía' }], pagination: {} })
  api.listCareerOptions.mockResolvedValue({ data: [{ id: 2, nombre: 'Profesorado de Inicial' }], pagination: {} })
  api.listTeacherOptions.mockResolvedValue({ data: [{ idUsuario: 30, apellidoNombre: 'Docente Nuevo' }], pagination: {} })
  adminApi.listActiveStudents.mockResolvedValue({ data: [], pagination: {} })
})

async function renderList(exam = mesa) {
  api.listExamTables.mockResolvedValue({ data: [exam], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      historicalRoute,
      { path: '/app/administracion/mesas', name: 'admin-exams', component: AdminExamsView },
      { path: '/app/administracion/mesas/:id', name: 'admin-exam-detail', component: AdminExamsView },
      { path: '/app/administracion/mesas/nueva', name: 'admin-exam-new', component: AdminExamsView },
      { path: '/app/administracion/mesas/:id/editar', name: 'admin-exam-edit', component: AdminExamsView },
    ],
  })
  await router.push('/app/administracion/mesas?estadoMesa=FINALIZADA')
  await router.isReady()
  render(defineComponent({ render: () => h(RouterView) }), { global: { plugins: [router] } })
}

describe('AdminExamsView', () => {
  it.each([[0, '0 inscriptos'], [1, '1 inscripto'], [2, '2 inscriptos']] as const)(
    'pluralizes the active enrollment count for %s', async (count, expected) => {
      await renderList({ ...mesa, _count: { inscripciones: count } })
      expect((await screen.findAllByText(expected)).length).toBeGreaterThan(0)
    },
  )

  it('uses backend filters and presents the institutional mesa summary', async () => {
    await renderList()

    expect((await screen.findAllByText('Pedagogía')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Profesorado de Inicial').length).toBeGreaterThan(1)
    expect(screen.queryByText('Carrera no informada')).toBeNull()
    expect(screen.getAllByText('Finalizada').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Presidente: Ana Profesora/).length).toBeGreaterThan(0)
    expect(api.listExamTables).toHaveBeenCalledWith(expect.objectContaining({ estadoMesa: 'FINALIZADA', page: 1, limit: 20 }))
  })

  it('presents a duplicated tribunal as incomplete in the listing', async () => {
    await renderList({
      ...mesa,
      tribunales: [...mesa.tribunales, { id: 4, profesorId: 20, apellidoNombre: 'Ana Profesora', rolTribunal: 'SUPLENTE' }],
    })

    expect((await screen.findAllByText('Incompleto')).length).toBeGreaterThan(0)
  })

  it('redirects direct access to finalized configuration to the read-only detail', async () => {
    api.getExamTable.mockResolvedValue(mesa)
    api.getExamWorkspace.mockResolvedValue({ detail: mesa, results: [] })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        historicalRoute,
        { path: '/app/administracion/mesas', name: 'admin-exams', component: AdminExamsView },
        { path: '/app/administracion/mesas/:id', name: 'admin-exam-detail', component: AdminExamsView },
        { path: '/app/administracion/mesas/nueva', name: 'admin-exam-new', component: AdminExamsView },
        { path: '/app/administracion/mesas/:id/editar', name: 'admin-exam-edit', component: AdminExamsView },
      ],
    })
    await router.push('/app/administracion/mesas/9/editar')
    await router.isReady()
    render(defineComponent({ render: () => h(RouterView) }), { global: { plugins: [router] } })

    expect(await screen.findByText('Resultados de la mesa')).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Editar mesa de examen' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Guardar mesa' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Editar configuración' })).toBeNull()
  })

  it('refreshes the configuration version after a conflict without replacing the form draft', async () => {
    api.getExamTable
      .mockResolvedValueOnce(editableMesa)
      .mockResolvedValueOnce({ ...editableMesa, version: 5 })
    api.updateExamTable.mockRejectedValue({ status: 409, message: 'Versión obsoleta' })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        historicalRoute,
        { path: '/app/administracion/mesas', name: 'admin-exams', component: AdminExamsView },
        { path: '/app/administracion/mesas/:id', name: 'admin-exam-detail', component: AdminExamsView },
        { path: '/app/administracion/mesas/:id/editar', name: 'admin-exam-edit', component: AdminExamsView },
      ],
    })
    await router.push('/app/administracion/mesas/9/editar')
    await router.isReady()
    render(defineComponent({ render: () => h(RouterView) }), { global: { plugins: [router] } })

    const date = await screen.findByLabelText('Fecha y hora')
    const user = userEvent.setup()
    await user.clear(date)
    await user.type(date, '2026-12-11T09:30')
    await user.click(screen.getByRole('button', { name: 'Guardar mesa' }))

    expect(await screen.findByText(/otra persona modificó la configuración/i)).toBeVisible()
    expect(api.getExamTable).toHaveBeenCalledTimes(2)
    expect(date).toHaveValue('2026-12-11T09:30')
  })

  it('refreshes the workspace after tribunal and enrollment conflicts', async () => {
    api.getExamWorkspace
      .mockResolvedValueOnce(workspace)
      .mockResolvedValueOnce({ detail: { ...editableMesa, version: 5 }, results: [] })
      .mockResolvedValueOnce({ detail: { ...editableMesa, version: 6 }, results: [] })
    api.assignTribunalMember.mockRejectedValue({ status: 409 })
    api.enrollStudent.mockRejectedValue({ status: 409 })
    adminApi.listActiveStudents.mockResolvedValue({
      data: [{ idUsuario: 13, apellidoNombre: 'Lucía Fernández', dni: '42666888', email: 'lucia@example.test', activo: true, rol: 'ALUMNO' }],
      pagination: {},
    })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        historicalRoute,
        { path: '/app/administracion/mesas', name: 'admin-exams', component: AdminExamsView },
        { path: '/app/administracion/mesas/:id', name: 'admin-exam-detail', component: AdminExamsView },
        { path: '/app/administracion/mesas/:id/editar', name: 'admin-exam-edit', component: AdminExamsView },
      ],
    })
    await router.push('/app/administracion/mesas/9')
    await router.isReady()
    render(defineComponent({ render: () => h(RouterView) }), { global: { plugins: [router] } })

    await screen.findByText('Resultados de la mesa')
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Docente'), '30')
    await user.selectOptions(screen.getByLabelText('Cargo'), 'SUPLENTE')
    await user.click(screen.getByRole('button', { name: 'Agregar' }))
    expect(await screen.findByText(/otra persona modificó el tribunal/i)).toBeVisible()
    expect(api.getExamWorkspace).toHaveBeenCalledTimes(2)

    await user.type(screen.getByLabelText('Buscar alumno por nombre o DNI'), '42666888')
    await screen.findByRole('option', { name: 'Lucía Fernández · DNI 42666888' })
    await user.selectOptions(screen.getByLabelText('Alumno'), '13')
    await user.click(screen.getByRole('button', { name: 'Inscribir' }))
    expect(await screen.findByText(/otra persona modificó las inscripciones/i)).toBeVisible()
    expect(api.enrollStudent).toHaveBeenCalledWith(9, 13, 'REGULAR', 5)
    expect(api.getExamWorkspace).toHaveBeenCalledTimes(3)
  })

  it('debounces student identity lookup and preserves the selected student after an enrollment failure', async () => {
    api.getExamWorkspace.mockResolvedValue(workspace)
    adminApi.listActiveStudents
      .mockRejectedValueOnce(new Error('temporary lookup failure'))
      .mockResolvedValueOnce({
        data: [{ idUsuario: 13, apellidoNombre: 'Lucía Fernández', dni: '42666888', email: 'lucia@example.test', activo: true, rol: 'ALUMNO' }],
        pagination: {},
      })
    api.enrollStudent.mockRejectedValue(new Error('write failed'))
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        historicalRoute,
        { path: '/app/administracion/mesas', name: 'admin-exams', component: AdminExamsView },
        { path: '/app/administracion/mesas/:id', name: 'admin-exam-detail', component: AdminExamsView },
        { path: '/app/administracion/mesas/:id/editar', name: 'admin-exam-edit', component: AdminExamsView },
      ],
    })
    await router.push('/app/administracion/mesas/9')
    await router.isReady()
    render(defineComponent({ render: () => h(RouterView) }), { global: { plugins: [router] } })
    await screen.findByText('Resultados de la mesa')
    const initialUser = userEvent.setup()
    await initialUser.click(screen.getByRole('button', { name: 'Inscribir' }))
    expect(screen.getByText('Seleccioná un alumno de la lista.')).toBeVisible()
    vi.useFakeTimers()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    await user.type(screen.getByLabelText('Buscar alumno por nombre o DNI'), 'luc')
    expect(adminApi.listActiveStudents).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(299)
    expect(adminApi.listActiveStudents).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await Promise.resolve()
    expect(screen.getByRole('button', { name: 'Reintentar búsqueda' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Reintentar búsqueda' }))
    await vi.advanceTimersByTimeAsync(300)
    await Promise.resolve()
    expect(screen.getByRole('option', { name: 'Lucía Fernández · DNI 42666888' })).toBeVisible()
    await user.selectOptions(screen.getByLabelText('Alumno'), '13')
    await user.click(screen.getByRole('button', { name: 'Inscribir' }))

    expect(await screen.findByText(/no se pudo registrar la inscripción/i)).toBeVisible()
    expect(screen.getByText(/Seleccionado: Lucía Fernández · DNI 42666888/)).toBeVisible()
    expect(api.enrollStudent).toHaveBeenCalledWith(9, 13, 'REGULAR', 4)
    vi.useRealTimers()
  })

  it('ignores an older student search response after a newer search completes', async () => {
    let resolveOlder!: (value: { data: Array<{ idUsuario: number; apellidoNombre: string; dni: string; email: string; activo: boolean; rol: string }>; pagination: Record<string, never> }) => void
    adminApi.listActiveStudents
      .mockImplementationOnce(() => new Promise(resolve => { resolveOlder = resolve }))
      .mockResolvedValueOnce({
        data: [{ idUsuario: 14, apellidoNombre: 'Lucía Fernández', dni: '42666888', email: 'lucia@example.test', activo: true, rol: 'ALUMNO' }],
        pagination: {},
      })
    api.getExamWorkspace.mockResolvedValue(workspace)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        historicalRoute,
        { path: '/app/administracion/mesas', name: 'admin-exams', component: AdminExamsView },
        { path: '/app/administracion/mesas/:id', name: 'admin-exam-detail', component: AdminExamsView },
        { path: '/app/administracion/mesas/:id/editar', name: 'admin-exam-edit', component: AdminExamsView },
      ],
    })
    await router.push('/app/administracion/mesas/9')
    await router.isReady()
    render(defineComponent({ render: () => h(RouterView) }), { global: { plugins: [router] } })
    await screen.findByText('Resultados de la mesa')
    vi.useFakeTimers()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const search = screen.getByLabelText('Buscar alumno por nombre o DNI')

    await user.type(search, 'lu')
    await vi.advanceTimersByTimeAsync(300)
    expect(adminApi.listActiveStudents).toHaveBeenCalledTimes(1)
    await user.type(search, 'cía')
    await vi.advanceTimersByTimeAsync(300)
    await Promise.resolve()
    await Promise.resolve()
    expect(screen.getByRole('option', { name: 'Lucía Fernández · DNI 42666888' })).toBeVisible()

    resolveOlder({
      data: [{ idUsuario: 13, apellidoNombre: 'Lucía Antigua', dni: '11111111', email: 'old@example.test', activo: true, rol: 'ALUMNO' }],
      pagination: {},
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(screen.queryByRole('option', { name: /Lucía Antigua/ })).not.toBeInTheDocument()
    expect(adminApi.listActiveStudents).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('refreshes the workspace after a withdrawal conflict and allows retry', async () => {
    api.getExamWorkspace
      .mockResolvedValueOnce(enrolledWorkspace)
      .mockResolvedValueOnce({ detail: { ...editableMesa, version: 5 }, results: enrolledWorkspace.results })
      .mockResolvedValueOnce({ detail: { ...editableMesa, version: 6 }, results: [] })
    api.withdrawStudent
      .mockRejectedValueOnce({ status: 409 })
      .mockResolvedValueOnce({ version: 7 })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        historicalRoute,
        { path: '/app/administracion/mesas', name: 'admin-exams', component: AdminExamsView },
        { path: '/app/administracion/mesas/:id', name: 'admin-exam-detail', component: AdminExamsView },
        { path: '/app/administracion/mesas/:id/editar', name: 'admin-exam-edit', component: AdminExamsView },
      ],
    })
    await router.push('/app/administracion/mesas/9')
    await router.isReady()
    render(defineComponent({ render: () => h(RouterView) }), { global: { plugins: [router] } })

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Dar de baja' }))

    expect(await screen.findByText(/otra persona modificó las inscripciones/i)).toBeVisible()
    expect(screen.getByText(/Versión 5/)).toBeVisible()
    expect(api.getExamWorkspace).toHaveBeenCalledTimes(2)

    await user.click(screen.getByRole('button', { name: 'Dar de baja' }))

    expect(api.withdrawStudent).toHaveBeenCalledTimes(2)
    expect(api.getExamWorkspace).toHaveBeenCalledTimes(3)
    expect(screen.queryByText(/otra persona modificó las inscripciones/i)).toBeNull()
  })
})
