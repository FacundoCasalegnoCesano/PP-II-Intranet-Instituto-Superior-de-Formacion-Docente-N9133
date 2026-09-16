import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import { reactive } from 'vue'
import CareerEnrollmentsView from './CareerEnrollmentsView.vue'
import { adminApi } from '../api/adminApi'

vi.mock('../api/adminApi', () => ({
  adminApi: {
    listActiveStudents: vi.fn(),
    listActiveCareers: vi.fn(),
    listCareerEnrollments: vi.fn(),
    enrollInCareer: vi.fn(),
    removeCareerEnrollment: vi.fn(),
  },
}))

const route = reactive({ query: {} as Record<string, string | undefined>, fullPath: '/app/administracion/inscripciones-carreras' })
const router = { replace: vi.fn() }
const feedback = { success: vi.fn(), error: vi.fn() }

function applyRouteQuery(query: Record<string, string | undefined>): void {
  route.query = query
  const search = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => { if (value !== undefined) search.set(key, value) })
  route.fullPath = `/app/administracion/inscripciones-carreras${search.toString() ? `?${search.toString()}` : ''}`
}

vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => router }))
vi.mock('@/ui/feedback', () => ({ useFeedback: () => feedback }))

const students = { data: [{ idUsuario: 13, apellidoNombre: 'Lucía Test', dni: '42666888', email: 'lucia@test.edu', activo: true, rol: 'ALUMNO' }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } }
const careers = { data: [{ id: 3, nombre: 'Profesorado de Inicial', duracionAnios: 4, activo: true }, { id: 4, nombre: 'Profesorado de Primaria', duracionAnios: 4, activo: true }], pagination: { page: 1, limit: 100, total: 2, totalPages: 1 } }
const enrollment = { id: 8, usuario: { idUsuario: 13, apellidoNombre: 'Lucía Test', dni: '42666888', email: 'lucia@test.edu' }, cicloLectivo: 2026, fechaInscripcion: '2026-03-10T12:00:00.000Z', activo: true }

describe('CareerEnrollmentsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(adminApi.listActiveStudents).mockResolvedValue(students)
    vi.mocked(adminApi.listActiveCareers).mockResolvedValue(careers)
    vi.mocked(adminApi.listCareerEnrollments).mockResolvedValue({ data: [enrollment], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } })
    vi.mocked(adminApi.enrollInCareer).mockResolvedValue({ data: { reactivada: true }, message: 'Inscripción a la carrera reactivada exitosamente' })
    vi.mocked(adminApi.removeCareerEnrollment).mockResolvedValue(undefined)
    applyRouteQuery({})
    router.replace.mockImplementation(async ({ query }: { query: Record<string, string | undefined> }) => { applyRouteQuery(query) })
  })

  it('loads active catalogs and displays active enrollment records for the selected career', async () => {
    render(CareerEnrollmentsView)
    expect(await screen.findByRole('option', { name: /Profesorado de Inicial/ })).toBeVisible()
    expect((await screen.findAllByText('Lucía Test')).length).toBe(2)
    expect(screen.getByText('42666888')).toBeVisible()
    expect(screen.getAllByRole('button', { name: 'Dar de baja a Lucía Test' })[0]).toBeVisible()
    expect(adminApi.listCareerEnrollments).toHaveBeenCalledWith(3, expect.any(Object))
  })

  it('keeps the form selection and displays the backend reactivation message after an enrollment', async () => {
    render(CareerEnrollmentsView)
    await screen.findAllByText('Lucía Test')
    await fireEvent.update(screen.getByLabelText('Alumno activo'), '13')
    await fireEvent.click(screen.getByRole('button', { name: 'Inscribir alumno' }))
    await waitFor(() => expect(adminApi.enrollInCareer).toHaveBeenCalledWith({ alumnoId: 13, carreraId: 3, cicloLectivo: 2026 }))
    expect(feedback.success).toHaveBeenCalledWith('Inscripción a la carrera reactivada exitosamente')
    expect(screen.getByLabelText('Alumno activo')).toHaveValue('13')
  })

  it('shows backend errors without clearing the selected form values', async () => {
    vi.mocked(adminApi.enrollInCareer).mockRejectedValueOnce(new Error('El alumno ya está inscripto en esta carrera'))
    render(CareerEnrollmentsView)
    await screen.findAllByText('Lucía Test')
    await fireEvent.update(screen.getByLabelText('Alumno activo'), '13')
    await fireEvent.click(screen.getByRole('button', { name: 'Inscribir alumno' }))
    await waitFor(() => expect(feedback.error).toHaveBeenCalledWith('El alumno ya está inscripto en esta carrera'))
    expect(screen.getByLabelText('Alumno activo')).toHaveValue('13')
  })

  it('confirms a logical removal and reloads the selected career', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(CareerEnrollmentsView)
    await screen.findAllByRole('button', { name: 'Dar de baja a Lucía Test' })
    await fireEvent.click(screen.getAllByRole('button', { name: 'Dar de baja a Lucía Test' })[0])
    await waitFor(() => expect(adminApi.removeCareerEnrollment).toHaveBeenCalledWith(8))
    expect(adminApi.listCareerEnrollments).toHaveBeenCalledTimes(2)
  })

  it('searches students server-side with a bounded result limit', async () => {
    render(CareerEnrollmentsView)
    await screen.findAllByText('Lucía Test')
    await fireEvent.update(screen.getByLabelText('Buscar alumno'), 'Zoe')
    await waitFor(() => expect(adminApi.listActiveStudents).toHaveBeenCalledWith('Zoe', { limit: 50 }))
  })

  it('synchronizes an invalid URL career fallback after loading the active catalog', async () => {
    route.query = { carreraId: '999' }
    vi.mocked(adminApi.listActiveCareers).mockResolvedValueOnce(careers)
    render(CareerEnrollmentsView)
    await screen.findByRole('option', { name: /Profesorado de Primaria/ })
    expect(router.replace).toHaveBeenCalledWith({ query: { carreraId: '3', page: undefined } })
  })

  it('disables the complete enrollment fieldset while saving', async () => {
    const pending = new Promise<{ data: { reactivada: boolean }; message: string }>(() => undefined)
    vi.mocked(adminApi.enrollInCareer).mockReturnValueOnce(pending)
    render(CareerEnrollmentsView)
    await screen.findAllByText('Lucía Test')
    await fireEvent.update(screen.getByLabelText('Alumno activo'), '13')
    await fireEvent.submit(screen.getByRole('form'))
    await waitFor(() => expect(screen.getByRole('group')).toBeDisabled())
    expect(screen.getByLabelText('Carrera activa')).toBeDisabled()
    expect(screen.getByLabelText('Ciclo lectivo')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Inscribiendo…' })).toBeDisabled()
  })

  it('keeps only the newest enrollment response after rapid career changes', async () => {
    const stale = Promise.resolve({ data: [{ ...enrollment, id: 20, usuario: { ...enrollment.usuario, apellidoNombre: 'Respuesta vieja' } }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } })
    let resolveNewest!: (value: typeof stale extends Promise<infer T> ? T : never) => void
    const newest = new Promise<typeof enrollment extends never ? never : { data: typeof enrollment[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>((resolve) => { resolveNewest = resolve })
    vi.mocked(adminApi.listCareerEnrollments)
      .mockResolvedValueOnce({ data: [enrollment], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } })
      .mockReturnValueOnce(stale)
      .mockReturnValueOnce(newest)
    render(CareerEnrollmentsView)
    await screen.findAllByText('Lucía Test')
    await fireEvent.update(screen.getByLabelText('Carrera activa'), '4')
    await fireEvent.update(screen.getByLabelText('Carrera activa'), '3')
    resolveNewest({ data: [{ ...enrollment, id: 21, usuario: { ...enrollment.usuario, apellidoNombre: 'Respuesta nueva' } }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } })
    await waitFor(() => expect(screen.getAllByText('Respuesta nueva').length).toBeGreaterThan(0))
    expect(screen.queryByText('Respuesta vieja')).not.toBeInTheDocument()
  })

  it('uses a real submit button and contextualizes each removal action', async () => {
    render(CareerEnrollmentsView)
    await screen.findAllByText('Lucía Test')
    expect(screen.getByRole('button', { name: /Inscribir alumno/ })).toHaveAttribute('type', 'submit')
    expect(screen.getAllByRole('button', { name: 'Dar de baja a Lucía Test' })).toHaveLength(2)
  })

  it('renders every career returned by the active catalog helper', async () => {
    const allCareers = Array.from({ length: 12 }, (_, index) => ({ id: index + 3, nombre: `Carrera ${index + 1}`, duracionAnios: 4, activo: true }))
    vi.mocked(adminApi.listActiveCareers).mockResolvedValueOnce({ data: allCareers, pagination: { page: 1, limit: 20, total: 12, totalPages: 1 } })
    render(CareerEnrollmentsView)
    expect(await screen.findByRole('option', { name: 'Carrera 12' })).toBeVisible()
    expect(adminApi.listActiveCareers).toHaveBeenCalledTimes(1)
    expect(adminApi.listActiveCareers).toHaveBeenCalledWith()
  })

  it('invalidates and clears a pending roster when the career selection becomes empty', async () => {
    let resolveRoster!: (value: { data: typeof enrollment[]; pagination: { page: number; limit: number; total: number; totalPages: number } }) => void
    const pendingRoster = new Promise<{ data: typeof enrollment[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>((resolve) => { resolveRoster = resolve })
    vi.mocked(adminApi.listCareerEnrollments).mockReturnValueOnce(pendingRoster)
    render(CareerEnrollmentsView)
    await screen.findByRole('option', { name: /Profesorado de Inicial/ })
    await waitFor(() => expect(screen.getByText('Cargando…')).toBeVisible())
    await fireEvent.update(screen.getByLabelText('Carrera activa'), '')
    await waitFor(() => expect(screen.getByText('No hay alumnos activos inscriptos en esta carrera.')).toBeVisible())
    expect(screen.queryByText('Cargando…')).not.toBeInTheDocument()
    resolveRoster({ data: [enrollment], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } })
    await Promise.resolve()
    expect(screen.queryByText('Lucía Test')).not.toBeInTheDocument()
  })

  it('rejects a career catalog whose first page metadata is not page one', async () => {
    vi.mocked(adminApi.listActiveCareers).mockRejectedValueOnce(new Error('No pudimos cargar las carreras.'))
    render(CareerEnrollmentsView)
    expect(await screen.findByText('No pudimos cargar las carreras.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeVisible()
  })

  it('rejects a career catalog when total and limit do not match totalPages', async () => {
    vi.mocked(adminApi.listActiveCareers).mockRejectedValueOnce(new Error('No pudimos cargar las carreras.'))
    render(CareerEnrollmentsView)
    expect(await screen.findByText('No pudimos cargar las carreras.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeVisible()
    expect(screen.queryByRole('option', { name: /Profesorado de Inicial/ })).not.toBeInTheDocument()
  })

  it('rejects a career catalog when a later page reports incoherent pagination', async () => {
    vi.mocked(adminApi.listActiveCareers)
      .mockRejectedValueOnce(new Error('No pudimos cargar las carreras.'))
    render(CareerEnrollmentsView)
    expect(await screen.findByText('No pudimos cargar las carreras.')).toBeVisible()
    expect(screen.queryByRole('option', { name: /Profesorado de Inicial/ })).not.toBeInTheDocument()
  })

  it('shows the empty state for a coherent empty career catalog', async () => {
    vi.mocked(adminApi.listActiveCareers).mockResolvedValueOnce({ data: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } })
    render(CareerEnrollmentsView)
    await waitFor(() => expect(screen.getByLabelText('Carrera activa')).toBeVisible())
    await waitFor(() => expect(screen.getByText('No hay alumnos activos inscriptos en esta carrera.')).toBeVisible())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
  })

  it('clears the roster synchronously before a rejected career navigation and ignores the old response', async () => {
    let resolveRoster!: (value: { data: typeof enrollment[]; pagination: { page: number; limit: number; total: number; totalPages: number } }) => void
    const pendingRoster = new Promise<{ data: typeof enrollment[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>((resolve) => { resolveRoster = resolve })
    vi.mocked(adminApi.listCareerEnrollments).mockReturnValueOnce(pendingRoster)
    render(CareerEnrollmentsView)
    await screen.findByRole('option', { name: /Profesorado de Inicial/ })
    await waitFor(() => expect(screen.getByText('Cargando…')).toBeVisible())
    vi.mocked(router.replace).mockRejectedValueOnce(new Error('navigation failed'))
    await fireEvent.update(screen.getByLabelText('Carrera activa'), '')
    expect(screen.queryByText('Cargando…')).not.toBeInTheDocument()
    expect(screen.getByText('No hay alumnos activos inscriptos en esta carrera.')).toBeVisible()
    resolveRoster({ data: [enrollment], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } })
    await Promise.resolve()
    expect(screen.queryByText('Lucía Test')).not.toBeInTheDocument()
  })

  it('returns to the last valid page after removing the only record on the last page', async () => {
    route.query = { carreraId: '3', page: '2' }
    route.fullPath = '/app/administracion/inscripciones-carreras?carreraId=3&page=2'
    let removed = false
    vi.mocked(adminApi.removeCareerEnrollment).mockImplementationOnce(async () => { removed = true })
    vi.mocked(adminApi.listCareerEnrollments).mockImplementation(async (_careerId, { page = 1 } = {}) => {
      if (page === 2 && !removed) return { data: [enrollment], pagination: { page: 2, limit: 20, total: 21, totalPages: 2 } }
      if (page === 2) return { data: [], pagination: { page: 2, limit: 20, total: 20, totalPages: 1 } }
      return { data: [enrollment], pagination: { page: 1, limit: 20, total: 20, totalPages: 1 } }
    })
    router.replace.mockImplementationOnce(async ({ query }: { query: Record<string, string | undefined> }) => {
      applyRouteQuery(query)
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(CareerEnrollmentsView)
    await screen.findAllByRole('button', { name: 'Dar de baja a Lucía Test' })
    await fireEvent.click(screen.getAllByRole('button', { name: 'Dar de baja a Lucía Test' })[0])

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith({ query: { carreraId: '3', page: '1' } }))
    await waitFor(() => expect(adminApi.listCareerEnrollments).toHaveBeenCalledWith(3, { page: 1, limit: 20 }))
    expect(screen.queryByText('No hay alumnos activos inscriptos en esta carrera.')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText('Lucía Test').length).toBeGreaterThan(0))
  })

  it('takes career and page from external URL changes and discards the old roster response', async () => {
    route.query = { carreraId: '3', page: '1' }
    route.fullPath = '/app/administracion/inscripciones-carreras?carreraId=3&page=1'
    let resolveOld!: (value: { data: typeof enrollment[]; pagination: { page: number; limit: number; total: number; totalPages: number } }) => void
    const oldResponse = new Promise<{ data: typeof enrollment[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>((resolve) => { resolveOld = resolve })
    const newEnrollment = { ...enrollment, id: 9, usuario: { ...enrollment.usuario, apellidoNombre: 'Nueva nómina' } }
    vi.mocked(adminApi.listCareerEnrollments)
      .mockReturnValueOnce(oldResponse)
      .mockResolvedValueOnce({ data: [newEnrollment], pagination: { page: 2, limit: 20, total: 21, totalPages: 2 } })
    render(CareerEnrollmentsView)
    await screen.findByRole('option', { name: /Profesorado de Primaria/ })

    route.query = { carreraId: '4', page: '2' }
    route.fullPath = '/app/administracion/inscripciones-carreras?carreraId=4&page=2'

    await waitFor(() => expect(screen.getByLabelText('Carrera activa')).toHaveValue('4'))
    await waitFor(() => expect(screen.getAllByText('Nueva nómina').length).toBeGreaterThan(0))
    resolveOld({ data: [enrollment], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } })
    await Promise.resolve()

    expect(screen.queryAllByText('Lucía Test')).toHaveLength(0)
    expect(adminApi.listCareerEnrollments).toHaveBeenCalledWith(4, { page: 2, limit: 20 })
    expect(router.replace).not.toHaveBeenCalled()
  })
})
