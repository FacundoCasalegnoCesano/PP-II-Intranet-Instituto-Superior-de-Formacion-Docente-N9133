import { cleanup, render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import AdminPeriodsView from './AdminPeriodsView.vue'
import type { EnrollmentPeriod } from '../types/admin'

const mocks = vi.hoisted(() => ({
  listPeriods: vi.fn(),
  getPeriod: vi.fn(),
  listCareers: vi.fn(),
  getSubjectsByYear: vi.fn(),
  listExams: vi.fn(),
  updatePeriod: vi.fn(),
}))

vi.mock('../api/adminApi', () => ({ adminApi: mocks }))
vi.mock('@/ui/feedback', () => ({ useFeedback: () => ({ success: vi.fn(), error: vi.fn() }) }))

const period = {
  id: 9,
  tipo: 'EXAMEN',
  cicloLectivo: 2026,
  fechaInicio: '2026-12-01T00:00:00.000Z',
  fechaFin: '2026-12-10T23:59:59.000Z',
  descripcion: 'Primer llamado',
  activo: true,
  cantidadMaterias: 0,
  cantidadMesas: 2,
  estado: 'PROGRAMADO',
}

const selectedExam = { id: 202, materia: { id: 24, nombre: 'Mesa fuera de página' }, fecha: '2026-12-02T02:30:00.000Z', tipoExamen: 'ORAL', llamado: 1 }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise })
  return { promise, resolve, reject }
}

async function renderList() {
  mocks.listPeriods.mockResolvedValue({ data: [period], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/app/administracion/periodos', name: 'admin-periods', component: AdminPeriodsView }, { path: '/app/administracion/periodos/nuevo', name: 'admin-period-create', component: AdminPeriodsView }, { path: '/app/administracion/periodos/:id', name: 'admin-period-detail', component: AdminPeriodsView }, { path: '/app/administracion/periodos/:id/editar', name: 'admin-period-edit', component: AdminPeriodsView }],
  })
  await router.push('/app/administracion/periodos')
  await router.isReady()
  render(defineComponent({ render: () => h(RouterView) }), { global: { plugins: [router] } })
  return router
}

async function renderCreate() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/app/administracion/periodos/nuevo', name: 'admin-period-create', component: AdminPeriodsView }, { path: '/app/administracion/periodos', name: 'admin-periods', component: AdminPeriodsView }, { path: '/app/administracion/periodos/:id', name: 'admin-period-detail', component: AdminPeriodsView }, { path: '/app/administracion/periodos/:id/editar', name: 'admin-period-edit', component: AdminPeriodsView }],
  })
  await router.push('/app/administracion/periodos/nuevo'); await router.isReady()
  const view = render(defineComponent({ render: () => h(RouterView) }), { global: { plugins: [router] } })
  return { router, ...view }
}

async function renderEdit() {
  mocks.listCareers.mockResolvedValue({ data: [] })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/app/administracion/periodos/nuevo', name: 'admin-period-create', component: AdminPeriodsView }, { path: '/app/administracion/periodos', name: 'admin-periods', component: AdminPeriodsView }, { path: '/app/administracion/periodos/:id', name: 'admin-period-detail', component: AdminPeriodsView }, { path: '/app/administracion/periodos/:id/editar', name: 'admin-period-edit', component: AdminPeriodsView }],
  })
  await router.push('/app/administracion/periodos/9/editar'); await router.isReady()
  const view = render(defineComponent({ render: () => h(RouterView) }), { global: { plugins: [router] } })
  return { router, ...view }
}

beforeEach(() => { vi.resetAllMocks() })
afterEach(() => { cleanup() })

describe('AdminPeriodsView', () => {
  it('shows an understandable exam summary in desktop and mobile layouts', async () => {
    await renderList()
    expect((await screen.findAllByText('Inscripción a exámenes · Ciclo 2026')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Primer llamado').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Programado').length).toBeGreaterThan(0)
    expect(screen.getAllByText('2 mesas habilitadas').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: 'Ver detalle' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: 'Editar' }).length).toBeGreaterThan(0)
  })

  it('hydrates an off-page selected mesa with a checked checkbox using its distinct identity', async () => {
    mocks.getPeriod.mockResolvedValue({ ...period, mesas: [{ mesaId: selectedExam.id, mesa: selectedExam }], materias: [] })
    mocks.listCareers.mockResolvedValue({ data: [] })
    const pageOne = deferred<{ data: typeof selectedExam[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>()
    mocks.listExams.mockReturnValue(pageOne.promise)
    await renderEdit()
    await waitFor(() => expect(mocks.listExams).toHaveBeenCalledWith({ page: 1, limit: 100 }))
    pageOne.resolve({ data: [{ id: 101, materia: { id: 11, nombre: 'Mesa página uno' }, fecha: '2026-12-01T18:00:00.000Z', tipoExamen: 'ORAL', llamado: 1 }], pagination: { page: 1, limit: 1, total: 2, totalPages: 2 } })
    expect(await screen.findByRole('checkbox', { name: /Mesa fuera de página/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Mesa página uno/ })).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeEnabled()
    expect(mocks.listExams).toHaveBeenCalledTimes(1)
  })

  it('keeps mesasIds through page navigation and sends the selected ID on save', async () => {
    mocks.getPeriod.mockResolvedValue({ ...period, mesas: [{ mesaId: selectedExam.id, mesa: selectedExam }], materias: [] })
    mocks.listCareers.mockResolvedValue({ data: [] })
    const pageOne = deferred<{ data: typeof selectedExam[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>()
    const pageTwo = deferred<{ data: typeof selectedExam[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>()
    mocks.listExams.mockImplementation(({ page }: { page: number }) => page === 1 ? pageOne.promise : pageTwo.promise)
    mocks.updatePeriod.mockResolvedValue({})
    const { router } = await renderEdit()
    pageOne.resolve({ data: [{ id: 101, materia: { id: 11, nombre: 'Mesa página uno' }, fecha: '2026-12-01T18:00:00.000Z', tipoExamen: 'ORAL', llamado: 1 }], pagination: { page: 1, limit: 1, total: 2, totalPages: 2 } })
    expect(await screen.findByRole('checkbox', { name: /Mesa fuera de página/ })).toBeChecked()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Página siguiente' }))
    pageTwo.resolve({ data: [selectedExam], pagination: { page: 2, limit: 1, total: 2, totalPages: 2 } })
    expect(await screen.findByText('Página 2 de 2')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Mesa fuera de página/ })).toBeChecked()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Página anterior' }))
    expect(await screen.findByText('Página 1 de 2')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Mesa fuera de página/ })).toBeChecked()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Guardar período' }))
    await waitFor(() => expect(mocks.updatePeriod).toHaveBeenCalledWith(9, expect.objectContaining({ mesasIds: [selectedExam.id] })))
    const [, payload] = mocks.updatePeriod.mock.calls[0]
    expect(payload).not.toHaveProperty('materiasIds')
    expect(payload).toMatchObject({ tipo: 'EXAMEN', mesasIds: [selectedExam.id] })
    expect(router.currentRoute.value.name).toBe('admin-periods')
  })

  it('removes a mesa ID when the selected off-page mesa is unchecked', async () => {
    const retainedExam = { id: 303, materia: { id: 33, nombre: 'Mesa conservada' }, fecha: '2026-12-03T18:00:00.000Z', tipoExamen: 'ESCRITO', llamado: 1 }
    mocks.getPeriod.mockResolvedValue({ ...period, mesas: [{ mesaId: selectedExam.id, mesa: selectedExam }, { mesaId: retainedExam.id, mesa: retainedExam }], materias: [] })
    mocks.listCareers.mockResolvedValue({ data: [] })
    mocks.listExams.mockResolvedValue({ data: [selectedExam, retainedExam], pagination: { page: 1, limit: 100, total: 2, totalPages: 1 } })
    mocks.updatePeriod.mockResolvedValue({})
    await renderEdit()
    const checkbox = await screen.findByRole('checkbox', { name: /Mesa fuera de página/ })
    expect(checkbox).toBeChecked()
    await userEvent.setup().click(checkbox)
    expect(checkbox).not.toBeChecked()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Guardar período' }))
    await waitFor(() => expect(mocks.updatePeriod).toHaveBeenCalledWith(9, expect.objectContaining({ mesasIds: [retainedExam.id] })))
  })

  it('distinguishes selector errors from an empty selector and retries', async () => {
    mocks.listExams.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } })
    const { router } = await renderCreate()
    await screen.findByRole('combobox', { name: 'Tipo de inscripción' })
    const type = screen.getByRole('combobox', { name: 'Tipo de inscripción' })
    await userEvent.setup().selectOptions(type, 'EXAMEN')
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar las mesas de examen.')
    await screen.getByRole('button', { name: 'Reintentar mesas' }).click()
    expect(await screen.findByText('No hay mesas activas disponibles para seleccionar.')).toBeInTheDocument()
    await router.push('/app/administracion/periodos')
  })

  it('does not let a slower detail response overwrite the newer route', async () => {
    let resolveOld!: (value: EnrollmentPeriod) => void
    const old = new Promise<EnrollmentPeriod>((resolve) => { resolveOld = resolve })
    mocks.getPeriod.mockImplementation((id: number) => id === 1 ? old : Promise.resolve({ ...period, id: 2, descripcion: 'Segundo' }))
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/app/administracion/periodos/:id', name: 'admin-period-detail', component: AdminPeriodsView }, { path: '/app/administracion/periodos/:id/editar', name: 'admin-period-edit', component: AdminPeriodsView }] })
    await router.push('/app/administracion/periodos/1'); await router.isReady()
    render(defineComponent({ render: () => h(RouterView) }), { global: { plugins: [router] } })
    await router.push('/app/administracion/periodos/2')
    expect(await screen.findByText('Segundo')).toBeInTheDocument()
    resolveOld({ ...period, id: 1, descripcion: 'Viejo' })
    await Promise.resolve(); await Promise.resolve()
    expect(screen.queryByText('Viejo')).not.toBeInTheDocument()
  })

  it('does not let a slower form or career response overwrite the newer selection', async () => {
    const oldPeriod = deferred<EnrollmentPeriod>()
    mocks.listCareers.mockResolvedValue({ data: [] })
    mocks.getPeriod.mockImplementationOnce(() => oldPeriod.promise).mockResolvedValue({ ...period, id: 10, descripcion: 'Formulario nuevo', tipo: 'MATERIA', materias: [] })
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/app/administracion/periodos/nuevo', name: 'admin-period-create', component: AdminPeriodsView }, { path: '/app/administracion/periodos', name: 'admin-periods', component: AdminPeriodsView }, { path: '/app/administracion/periodos/:id', name: 'admin-period-detail', component: AdminPeriodsView }, { path: '/app/administracion/periodos/:id/editar', name: 'admin-period-edit', component: AdminPeriodsView }] })
    await router.push('/app/administracion/periodos/9/editar'); await router.isReady()
    render(defineComponent({ render: () => h(RouterView) }), { global: { plugins: [router] } })
    await waitFor(() => expect(mocks.getPeriod).toHaveBeenCalledWith(9))
    await router.push('/app/administracion/periodos/10/editar')
    expect(await screen.findByDisplayValue('Formulario nuevo')).toBeInTheDocument()
    oldPeriod.resolve({ ...period, id: 9, descripcion: 'Formulario viejo' })
    await Promise.resolve(); await Promise.resolve()
    expect(screen.queryByDisplayValue('Formulario viejo')).not.toBeInTheDocument()
    expect(screen.queryByText('Carrera vieja')).not.toBeInTheDocument()
  })

  it('does not let a slower career response overwrite the newer career subjects', async () => {
    const careerOne = deferred<Array<{ anio: number; materias: Array<{ id: number; nombre: string }> }>>()
    const careerTwo = deferred<Array<{ anio: number; materias: Array<{ id: number; nombre: string }> }>>()
    mocks.listCareers.mockResolvedValue({ data: [{ id: 1, nombre: 'Carrera uno' }, { id: 2, nombre: 'Carrera dos' }] })
    mocks.getSubjectsByYear.mockImplementation((id: number) => id === 1 ? careerOne.promise : careerTwo.promise)
    const { router } = await renderCreate()
    const career = (await screen.findAllByRole('combobox', { name: 'Carrera' }))[0]
    await userEvent.setup().selectOptions(career, '1')
    await userEvent.setup().selectOptions(career, '2')
    careerTwo.resolve([{ anio: 2, materias: [{ id: 22, nombre: 'Materia vigente' }] }])
    expect(await screen.findByText('Materia vigente')).toBeInTheDocument()
    careerOne.resolve([{ anio: 1, materias: [{ id: 11, nombre: 'Materia vieja' }] }])
    await Promise.resolve(); await Promise.resolve()
    expect(screen.queryByText('Materia vieja')).not.toBeInTheDocument()
    await router.push('/app/administracion/periodos')
  })

  it('cleans incompatible mesa selection on a user type change but not during hydration', async () => {
    mocks.listExams.mockResolvedValue({ data: [selectedExam], pagination: { page: 1, limit: 100, total: 1, totalPages: 1 } })
    const { router } = await renderCreate()
    const type = (await screen.findAllByRole('combobox', { name: 'Tipo de inscripción' }))[0]
    await userEvent.setup().selectOptions(type, 'EXAMEN')
    const checkbox = await screen.findByRole('checkbox', { name: /Mesa fuera de página/ })
    await userEvent.setup().click(checkbox)
    await userEvent.setup().selectOptions(type, 'MATERIA')
    await userEvent.setup().selectOptions(type, 'EXAMEN')
    expect(await screen.findByRole('checkbox', { name: /Mesa fuera de página/ })).not.toBeChecked()
    await router.push('/app/administracion/periodos')
  })

  it('ignores a deferred exam response after the user changes the form type', async () => {
    const pendingExams = deferred<{ data: typeof selectedExam[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>()
    mocks.listExams.mockReturnValue(pendingExams.promise)
    const { router } = await renderCreate()
    const type = await screen.findByRole('combobox', { name: 'Tipo de inscripción' })
    await userEvent.setup().selectOptions(type, 'EXAMEN')
    await waitFor(() => expect(mocks.listExams).toHaveBeenCalledWith({ page: 1, limit: 100 }))
    await userEvent.setup().selectOptions(type, 'MATERIA')
    pendingExams.resolve({ data: [selectedExam], pagination: { page: 1, limit: 100, total: 1, totalPages: 1 } })
    await Promise.resolve(); await Promise.resolve()
    expect(screen.queryByText(/Mesa fuera de página/)).not.toBeInTheDocument()
    await router.push('/app/administracion/periodos')
  })

  it('reloads the final exam type after a deferred hydration is interrupted by EXAMEN to MATERIA to EXAMEN', async () => {
    const oldExams = deferred<{ data: typeof selectedExam[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>()
    const finalExam = { ...selectedExam, id: 404, materia: { id: 44, nombre: 'Mesa del estado final' } }
    const finalExams = deferred<{ data: typeof selectedExam[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>()
    mocks.getPeriod.mockResolvedValue({ ...period, mesas: [{ mesaId: selectedExam.id, mesa: selectedExam }], materias: [] })
    mocks.listCareers.mockResolvedValue({ data: [] })
    mocks.listExams.mockImplementationOnce(() => oldExams.promise).mockImplementationOnce(() => finalExams.promise)
    const { router } = await renderEdit()
    const type = await screen.findByRole('combobox', { name: 'Tipo de inscripción' })
    await waitFor(() => expect(mocks.listExams).toHaveBeenCalledTimes(1))

    await userEvent.setup().selectOptions(type, 'MATERIA')
    await userEvent.setup().selectOptions(type, 'EXAMEN')
    await waitFor(() => expect(mocks.listExams).toHaveBeenCalledTimes(2))

    oldExams.resolve({ data: [selectedExam], pagination: { page: 1, limit: 100, total: 1, totalPages: 1 } })
    await Promise.resolve(); await Promise.resolve()
    expect(screen.queryByText(/Mesa fuera de página/)).not.toBeInTheDocument()

    finalExams.resolve({ data: [finalExam], pagination: { page: 1, limit: 100, total: 1, totalPages: 1 } })
    expect(await screen.findByRole('checkbox', { name: /Mesa del estado final/ })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Mesa del estado final/ })).not.toBeChecked()
    await router.push('/app/administracion/periodos')
  })

  it('ignores a deferred exam response after the form is unmounted', async () => {
    const pendingExams = deferred<{ data: typeof selectedExam[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>()
    mocks.listExams.mockReturnValue(pendingExams.promise)
    const { unmount } = await renderCreate()
    const type = await screen.findByRole('combobox', { name: 'Tipo de inscripción' })
    await userEvent.setup().selectOptions(type, 'EXAMEN')
    await waitFor(() => expect(mocks.listExams).toHaveBeenCalled())
    unmount()
    pendingExams.resolve({ data: [selectedExam], pagination: { page: 1, limit: 100, total: 1, totalPages: 1 } })
    await Promise.resolve(); await Promise.resolve()
    expect(screen.queryByText('Mesa fuera de página')).not.toBeInTheDocument()
  })
})
