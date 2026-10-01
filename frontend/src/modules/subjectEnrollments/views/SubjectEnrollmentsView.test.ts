import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { reactive } from 'vue'
import SubjectEnrollmentsView from './SubjectEnrollmentsView.vue'
import { useCareerSelectionStore } from '@/stores/careerSelectionStore'
import type { SubjectEnrollment } from '../types/subjectEnrollments'

const state = vi.hoisted(() => ({ user: { idUsuario: 13 }, activeRole: 'ALUMNO' }))
const reactiveState = reactive(state)
const api = vi.hoisted(() => ({ available: vi.fn(), mine: vi.fn(), verify: vi.fn(), enroll: vi.fn(), drop: vi.fn(), careers: vi.fn() }))
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason?: unknown) => void; const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej }); return { promise, resolve, reject } }
function enrollmentResult(data: SubjectEnrollment[], page = 1, total = data.length) { return { data, pagination: { page, limit: 20, total, totalPages: Math.ceil(total / 20) } } }
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => reactiveState }))
vi.mock('../api/subjectEnrollmentsApi', () => ({
  fetchAvailableSubjects: api.available,
  fetchMySubjectEnrollments: api.mine,
  verifySubjectEnrollment: api.verify,
  enrollInSubject: api.enroll,
  dropSubjectEnrollment: api.drop,
}))
vi.mock('@/modules/home/api/homeApi', () => ({ fetchStudentCareers: api.careers }))

describe('SubjectEnrollmentsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    reactiveState.user.idUsuario = 13
    reactiveState.activeRole = 'ALUMNO'
    api.careers.mockResolvedValue([
      { id: 7, carreraId: 3, activo: true, carrera: { id: 3, nombre: 'Profesorado', activo: true, materias: [] } },
      { id: 8, carreraId: 4, activo: true, carrera: { id: 4, nombre: 'Tecnicatura', activo: true, materias: [] } },
    ])
    api.available.mockReset(); api.mine.mockReset(); api.verify.mockReset(); api.enroll.mockReset(); api.drop.mockReset()
  })
  it('verifies a subject before showing enrollment confirmation and links to official schedules', async () => {
    api.available.mockResolvedValue([{ id: 5, nombre: 'Pedagogía', curso: { anio: 1 }, carreras: [{ id: 3, nombre: 'Profesorado' }], modalidad: 'SEMIPRESENCIAL', yaInscripto: false, yaAprobada: false, cumpleCorrelativas: true, correlativasPendientes: [], habilitada: true }])
    api.verify.mockResolvedValue({ puedeInscribirse: true, materia: { id: 5, nombre: 'Pedagogía', modalidad: 'SEMIPRESENCIAL', yaInscripto: false, yaAprobada: false, cumpleCorrelativas: true, correlativasPendientes: [], habilitada: true } })
    api.mine.mockResolvedValue(enrollmentResult([]))
    api.enroll.mockResolvedValue({ id: 8 })
    const user = userEvent.setup()
    render(SubjectEnrollmentsView)

    expect(await screen.findByText('Pedagogía')).toBeVisible()
    expect(screen.getByText('Modalidad: Semipresencial')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Horarios oficiales' })).toHaveAttribute('href', '/app/horarios')
    await user.click(screen.getByRole('button', { name: 'Verificar e inscribirme' }))
    expect(api.verify).toHaveBeenCalledWith(5, expect.any(Number))
    expect(await screen.findByRole('alertdialog', { name: 'Confirmar inscripción' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Inscribirme' }))
    expect(api.enroll).toHaveBeenCalledWith(expect.objectContaining({ materiaId: 5, modalidadElegida: 'SEMIPRESENCIAL' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Te inscribiste a Pedagogía.')
  })

  it('shows success feedback after dropping an active subject enrollment', async () => {
    api.available.mockResolvedValue([])
    api.mine.mockResolvedValue(enrollmentResult([{ id: 8, materiaId: 5, cicloLectivo: 2026, modalidadElegida: 'PRESENCIAL', estado: 'ACTIVA', materia: { id: 5, nombre: 'Pedagogía' } }]))
    api.drop.mockResolvedValue({ id: 8 })
    const user = userEvent.setup()
    render(SubjectEnrollmentsView)

    await user.click(await screen.findByRole('button', { name: 'Dar de baja' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Confirmar baja' })
    await user.click(within(dialog).getByRole('button', { name: 'Dar de baja' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Diste de baja tu inscripción a Pedagogía.')
  })

  it('loads the next enrollment page and returns to the last valid page after dropping its only row', async () => {
    const lastEnrollment = { id: 25, materiaId: 25, cicloLectivo: 2026, modalidadElegida: 'PRESENCIAL' as const, estado: 'ACTIVA' as const, materia: { id: 25, nombre: 'Materia 25' } }
    const remainingEnrollment = { id: 20, materiaId: 20, cicloLectivo: 2026, modalidadElegida: 'PRESENCIAL' as const, estado: 'ACTIVA' as const, materia: { id: 20, nombre: 'Materia 20' } }
    api.available.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 99, nombre: 'Oferta actualizada', yaInscripto: false, yaAprobada: false, cumpleCorrelativas: true, correlativasPendientes: [], habilitada: true }])
    api.mine.mockResolvedValueOnce(enrollmentResult([], 1, 25))
      .mockResolvedValueOnce(enrollmentResult([lastEnrollment], 2, 25))
      .mockResolvedValueOnce(enrollmentResult([], 2, 20))
      .mockResolvedValueOnce(enrollmentResult([remainingEnrollment], 1, 20))
    api.drop.mockResolvedValue({ id: 25 })
    const user = userEvent.setup()
    render(SubjectEnrollmentsView)

    await user.click(await screen.findByRole('button', { name: 'Página siguiente' }))
    expect(await screen.findByText(/Materia 25/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Dar de baja' }))
    await user.click(within(screen.getByRole('alertdialog', { name: 'Confirmar baja' })).getByRole('button', { name: 'Dar de baja' }))

    expect(await screen.findByText(/Materia 20/)).toBeVisible()
    expect(await screen.findByText('Oferta actualizada')).toBeVisible()
    expect(api.mine.mock.calls.map(([userId, page]) => [userId, page])).toEqual([[13, 1], [13, 2], [13, 2], [13, 1]])
    expect(api.available).toHaveBeenCalledTimes(2)
  })

  it('retries a failed list with the selected enrollment page', async () => {
    api.available.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([])
    api.mine.mockResolvedValue(enrollmentResult([]))
    const user = userEvent.setup()
    render(SubjectEnrollmentsView)

    await user.click(await screen.findByRole('button', { name: 'Reintentar' }))

    await waitFor(() => expect(api.available).toHaveBeenCalledTimes(2))
    expect(api.mine.mock.calls.map(([userId, page]) => [userId, page])).toEqual([[13, 1], [13, 1]])
  })

  it('refreshes the offer when retrying a failed reload after a drop on page two', async () => {
    const droppedEnrollment = { id: 25, materiaId: 25, cicloLectivo: 2026, modalidadElegida: 'PRESENCIAL' as const, estado: 'ACTIVA' as const, materia: { id: 25, nombre: 'Materia 25' } }
    const remainingEnrollment = { id: 20, materiaId: 20, cicloLectivo: 2026, modalidadElegida: 'PRESENCIAL' as const, estado: 'ACTIVA' as const, materia: { id: 20, nombre: 'Materia 20' } }
    api.available.mockResolvedValueOnce([{ id: 1, nombre: 'Oferta inicial', yaInscripto: false, yaAprobada: false, cumpleCorrelativas: true, correlativasPendientes: [], habilitada: true }])
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValueOnce([{ id: 2, nombre: 'Oferta restaurada', yaInscripto: false, yaAprobada: false, cumpleCorrelativas: true, correlativasPendientes: [], habilitada: true }])
    api.mine.mockResolvedValueOnce(enrollmentResult([], 1, 25))
      .mockResolvedValueOnce(enrollmentResult([droppedEnrollment], 2, 25))
      .mockResolvedValueOnce(enrollmentResult([], 2, 20))
      .mockResolvedValueOnce(enrollmentResult([], 2, 20))
      .mockResolvedValueOnce(enrollmentResult([remainingEnrollment], 1, 20))
    api.drop.mockResolvedValue({ id: 25 })
    const user = userEvent.setup()
    render(SubjectEnrollmentsView)

    await user.click(await screen.findByRole('button', { name: 'Página siguiente' }))
    await user.click(await screen.findByRole('button', { name: 'Dar de baja' }))
    await user.click(within(screen.getByRole('alertdialog', { name: 'Confirmar baja' })).getByRole('button', { name: 'Dar de baja' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar las materias disponibles.')
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('Oferta restaurada')).toBeVisible()
    expect(await screen.findByText(/Materia 20/)).toBeVisible()
    expect(api.available).toHaveBeenCalledTimes(3)
    expect(api.mine.mock.calls.map(([userId, page]) => [userId, page])).toEqual([[13, 1], [13, 2], [13, 2], [13, 2], [13, 1]])
  })

  it('discards an enrollment page that finishes after the authenticated identity changes', async () => {
    const oldPage = deferred<ReturnType<typeof enrollmentResult>>()
    const currentEnrollment = { id: 14, materiaId: 14, cicloLectivo: 2026, modalidadElegida: 'PRESENCIAL' as const, estado: 'ACTIVA' as const, materia: { id: 14, nombre: 'Inscripción actual' } }
    api.available.mockResolvedValue([])
    api.mine.mockReturnValueOnce(oldPage.promise).mockResolvedValueOnce(enrollmentResult([currentEnrollment]))
    render(SubjectEnrollmentsView)

    await waitFor(() => expect(api.mine).toHaveBeenCalledTimes(1))
    reactiveState.user.idUsuario = 14
    await waitFor(() => expect(api.mine).toHaveBeenCalledTimes(2))
    expect(await screen.findByText(/Inscripción actual/)).toBeVisible()
    oldPage.resolve(enrollmentResult([{ ...currentEnrollment, id: 13, materia: { id: 13, nombre: 'Inscripción anterior' } }]))
    await Promise.resolve(); await Promise.resolve()

    expect(screen.queryByText(/Inscripción anterior/)).not.toBeInTheDocument()
    expect(api.mine.mock.calls.map(([userId]) => userId)).toEqual([13, 14])
  })

  it('does not verify a subject already marked unavailable', async () => {
    api.verify.mockClear()
    api.available.mockResolvedValue([{ id: 6, nombre: 'Historia', modalidad: 'PRESENCIAL', yaInscripto: true, yaAprobada: false, cumpleCorrelativas: true, correlativasPendientes: [], habilitada: true }])
    api.mine.mockResolvedValue(enrollmentResult([]))
    const user = userEvent.setup()
    render(SubjectEnrollmentsView)

    expect(await screen.findByText('Ya estás inscripto/a')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Verificar e inscribirme' })).toBeDisabled()
    expect(api.verify).not.toHaveBeenCalled()
  })

  it('explains pending correlatives and keeps enrollment blocked', async () => {
    api.available.mockResolvedValue([{ id: 9, nombre: 'Residencia', modalidad: 'PRESENCIAL', yaInscripto: false, yaAprobada: false, cumpleCorrelativas: false, correlativasPendientes: [{ id: 3, nombre: 'Didáctica' }], habilitada: true }])
    api.mine.mockResolvedValue(enrollmentResult([]))
    const user = userEvent.setup()
    render(SubjectEnrollmentsView)

    expect(await screen.findByText('Falta regularizar o aprobar: Didáctica')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Verificar e inscribirme' })).toBeDisabled()
    expect(api.verify).not.toHaveBeenCalled()
  })

  it('keeps the confirmation selection and exposes the API rejection above the dialog', async () => {
    api.available.mockResolvedValue([{ id: 7, nombre: 'Didáctica', modalidad: 'PRESENCIAL', yaInscripto: false, yaAprobada: false, cumpleCorrelativas: true, correlativasPendientes: [], habilitada: true }])
    api.mine.mockResolvedValue(enrollmentResult([]))
    api.verify.mockResolvedValue({ puedeInscribirse: true, materia: { id: 7, nombre: 'Didáctica', modalidad: 'PRESENCIAL', yaInscripto: false, yaAprobada: false, cumpleCorrelativas: true, correlativasPendientes: [], habilitada: true } })
    api.enroll.mockRejectedValue(new Error('Período de inscripción cerrado'))
    const user = userEvent.setup()
    render(SubjectEnrollmentsView)

    await user.click(await screen.findByRole('button', { name: 'Verificar e inscribirme' }))
    await user.click(screen.getByRole('button', { name: 'Inscribirme' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Confirmar inscripción' })
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Período de inscripción cerrado')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('filters available subjects by the selected career and keeps active enrollments global', async () => {
    useCareerSelectionStore().selectCareer(3, { userId: 13, role: 'ALUMNO' })
    api.available.mockResolvedValue([
      { id: 5, nombre: 'Pedagogía', carreras: [{ id: 3, nombre: 'Profesorado' }], yaInscripto: false, yaAprobada: false, cumpleCorrelativas: true, correlativasPendientes: [], habilitada: true },
      { id: 6, nombre: 'Historia', carrera: { id: 4, nombre: 'Tecnicatura' }, yaInscripto: false, yaAprobada: false, cumpleCorrelativas: true, correlativasPendientes: [], habilitada: true },
      { id: 7, nombre: 'Campo común', carreras: [{ id: 3, nombre: 'Profesorado' }, { id: 4, nombre: 'Tecnicatura' }], yaInscripto: false, yaAprobada: false, cumpleCorrelativas: true, correlativasPendientes: [], habilitada: true },
    ])
    api.mine.mockResolvedValue(enrollmentResult([{ id: 9, materiaId: 6, cicloLectivo: 2026, modalidadElegida: 'PRESENCIAL', estado: 'ACTIVA', materia: { id: 6, nombre: 'Historia' } }]))

    render(SubjectEnrollmentsView)

    expect(await screen.findByText('Pedagogía')).toBeVisible()
    expect(screen.getByText('Campo común')).toBeVisible()
    expect(screen.queryByText('Historia')).not.toBeInTheDocument()
    expect(screen.getByText(/Las inscripciones activas se muestran para todas tus carreras/)).toBeVisible()
    expect(screen.getByText(/Historia.*2026/)).toBeVisible()
  })

  it('keeps a valid selected career when its offer is empty', async () => {
    useCareerSelectionStore().selectCareer(3, { userId: 13, role: 'ALUMNO' })
    api.available.mockResolvedValue([{ id: 6, nombre: 'Historia', carrera: { id: 4, nombre: 'Tecnicatura' }, yaInscripto: false, yaAprobada: false, cumpleCorrelativas: true, correlativasPendientes: [], habilitada: true }])
    api.mine.mockResolvedValue(enrollmentResult([]))

    render(SubjectEnrollmentsView)

    expect(await screen.findByText('No hay materias disponibles para Profesorado en este ciclo.')).toBeVisible()
    expect(screen.getByRole('option', { name: 'Profesorado', selected: true })).toBeVisible()
  })

  it('ignores a verification response after the selected career changes', async () => {
    useCareerSelectionStore().selectCareer(3, { userId: 13, role: 'ALUMNO' })
    const pending = deferred<{ puedeInscribirse: boolean; materia: AvailableSubject }>()
    api.available.mockResolvedValue([{ id: 5, nombre: 'Pedagogía', carrera: { id: 3, nombre: 'Profesorado' }, yaInscripto: false, yaAprobada: false, cumpleCorrelativas: true, correlativasPendientes: [], habilitada: true }])
    api.mine.mockResolvedValue(enrollmentResult([]))
    api.verify.mockReturnValueOnce(pending.promise)
    const user = userEvent.setup()
    render(SubjectEnrollmentsView)

    await user.click(await screen.findByRole('button', { name: 'Verificar e inscribirme' }))
    await fireEvent.update(screen.getByLabelText('Carrera'), '4')
    pending.resolve({ puedeInscribirse: true, materia: { id: 5, nombre: 'Pedagogía', yaInscripto: false, yaAprobada: false, cumpleCorrelativas: true, correlativasPendientes: [], habilitada: true } })

    await vi.waitFor(() => expect(screen.queryByRole('alertdialog', { name: 'Confirmar inscripción' })).not.toBeInTheDocument())
  })

  it('keeps only the newest cycle response and hides previous global enrollments while loading', async () => {
    const oldAvailable = deferred<AvailableSubject[]>()
    const oldMine = deferred<ReturnType<typeof enrollmentResult>>()
    const newAvailable = deferred<AvailableSubject[]>()
    const newMine = deferred<ReturnType<typeof enrollmentResult>>()
    api.available.mockReturnValueOnce(oldAvailable.promise).mockReturnValueOnce(newAvailable.promise)
    api.mine.mockReturnValueOnce(oldMine.promise).mockReturnValueOnce(newMine.promise)
    render(SubjectEnrollmentsView)
    await waitFor(() => expect(api.available).toHaveBeenCalledTimes(1))

    await fireEvent.update(screen.getByLabelText('Ciclo lectivo'), '2027')
    await waitFor(() => expect(api.available).toHaveBeenCalledTimes(2))
    newAvailable.resolve([{ id: 27, nombre: 'Materia 2027', carrera: { id: 3, nombre: 'Profesorado' }, yaInscripto: false, yaAprobada: false, cumpleCorrelativas: true, correlativasPendientes: [], habilitada: true }])
    newMine.resolve(enrollmentResult([]))
    expect(await screen.findByText('Materia 2027')).toBeVisible()
    oldAvailable.resolve([{ id: 26, nombre: 'Materia vieja', carrera: { id: 3, nombre: 'Profesorado' }, yaInscripto: false, yaAprobada: false, cumpleCorrelativas: true, correlativasPendientes: [], habilitada: true }])
    oldMine.resolve(enrollmentResult([{ id: 1, materiaId: 26, cicloLectivo: 2026, modalidadElegida: 'PRESENCIAL', estado: 'ACTIVA', materia: { id: 26, nombre: 'Inscripción vieja' } }]))
    await Promise.resolve(); await Promise.resolve()

    expect(screen.queryByText('Materia vieja')).not.toBeInTheDocument()
    expect(screen.queryByText('Inscripción vieja')).not.toBeInTheDocument()
    expect(screen.getByText('Materia 2027')).toBeVisible()
  })

  it('invalidates a pending cycle when the year is invalid and resumes with the next valid cycle', async () => {
    const oldAvailable = deferred<AvailableSubject[]>()
    const oldMine = deferred<ReturnType<typeof enrollmentResult>>()
    const newAvailable = deferred<AvailableSubject[]>()
    const newMine = deferred<ReturnType<typeof enrollmentResult>>()
    api.available.mockReturnValueOnce(oldAvailable.promise).mockReturnValueOnce(newAvailable.promise)
    api.mine.mockReturnValueOnce(oldMine.promise).mockReturnValueOnce(newMine.promise)
    render(SubjectEnrollmentsView)
    await waitFor(() => expect(api.available).toHaveBeenCalledTimes(1))

    await fireEvent.update(screen.getByLabelText('Ciclo lectivo'), '1999')
    expect(await screen.findByRole('alert')).toHaveTextContent('Ingresá un ciclo lectivo válido entre 2000 y 2100.')
    expect(screen.queryByText('Materia vieja')).not.toBeInTheDocument()

    await fireEvent.update(screen.getByLabelText('Ciclo lectivo'), '2027')
    await waitFor(() => expect(api.available).toHaveBeenCalledTimes(2))
    newAvailable.resolve([{ id: 27, nombre: 'Materia 2027', carrera: { id: 3, nombre: 'Profesorado' }, yaInscripto: false, yaAprobada: false, cumpleCorrelativas: true, correlativasPendientes: [], habilitada: true }])
    newMine.resolve(enrollmentResult([]))
    expect(await screen.findByText('Materia 2027')).toBeVisible()

    oldAvailable.resolve([{ id: 26, nombre: 'Materia vieja', carrera: { id: 3, nombre: 'Profesorado' }, yaInscripto: false, yaAprobada: false, cumpleCorrelativas: true, correlativasPendientes: [], habilitada: true }])
    oldMine.resolve(enrollmentResult([]))
    await Promise.resolve(); await Promise.resolve()
    expect(screen.queryByText('Materia vieja')).not.toBeInTheDocument()
  })

  it('keeps the newest cycle error when responses finish in either order', async () => {
    const oldAvailable = deferred<AvailableSubject[]>(); const oldMine = deferred<ReturnType<typeof enrollmentResult>>()
    const newAvailable = deferred<AvailableSubject[]>(); const newMine = deferred<ReturnType<typeof enrollmentResult>>()
    api.available.mockReturnValueOnce(oldAvailable.promise).mockReturnValueOnce(newAvailable.promise)
    api.mine.mockReturnValueOnce(oldMine.promise).mockReturnValueOnce(newMine.promise)
    render(SubjectEnrollmentsView)
    await waitFor(() => expect(api.available).toHaveBeenCalledTimes(1))
    await fireEvent.update(screen.getByLabelText('Ciclo lectivo'), '2027')
    await waitFor(() => expect(api.available).toHaveBeenCalledTimes(2))
    newAvailable.reject(new Error('nuevo fallo')); newMine.reject(new Error('nuevo fallo'))
    await screen.findByRole('alert')
    oldAvailable.resolve([]); oldMine.resolve(enrollmentResult([]))
    await Promise.resolve(); await Promise.resolve()
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar las materias disponibles.')
  })
})
