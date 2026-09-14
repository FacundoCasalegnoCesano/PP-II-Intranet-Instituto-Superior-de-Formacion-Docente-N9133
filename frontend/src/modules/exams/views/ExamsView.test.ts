import { nextTick, reactive } from 'vue'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import ExamsView from './ExamsView.vue'
import type { AvailableExam } from '../types/exams'

const state = vi.hoisted(() => ({ user: null as { idUsuario: number } | null, activeRole: null as string | null }))
const authState = reactive(state)
const api = vi.hoisted(() => ({ available: vi.fn(), mine: vi.fn(), enroll: vi.fn(), withdraw: vi.fn() }))
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => authState }))
vi.mock('../api/examsApi', () => ({
  fetchAvailableExams: api.available, fetchMyExamEnrollments: api.mine, enrollInExam: api.enroll, withdrawFromExam: api.withdraw,
}))

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function availableExam(id: number, nombre: string): AvailableExam {
  return {
    id,
    materia: { id, nombre, carrera: { id: 3, nombre: 'Profesorado' } },
    fecha: '2026-12-10T12:00:00.000Z',
    tipoExamen: 'ORAL',
    llamado: 1,
    tribunal: [],
    condicion: 'REGULAR',
    inscripto: false,
    version: 1,
  }
}

beforeEach(() => {
  api.available.mockReset()
  api.mine.mockReset()
  api.enroll.mockReset()
  api.withdraw.mockReset()
  authState.user = { idUsuario: 13 }
  authState.activeRole = 'ALUMNO'
})

describe('ExamsView', () => {
  it('shows backend-calculated exam condition, tribunal and enrolls without a student id', async () => {
    api.available.mockResolvedValue([{ id: 9, materia: { id: 5, nombre: 'Pedagogía', carrera: { id: 3, nombre: 'Profesorado' } }, fecha: '2026-12-10T12:00:00.000Z', tipoExamen: 'ORAL', llamado: 2, tribunal: [{ profesorId: 1, apellidoNombre: 'Ana Profesor', rolTribunal: 'PRESIDENTE' }], condicion: 'LIBRE', inscripto: false, version: 4 }])
    api.mine.mockResolvedValue([])
    api.enroll.mockResolvedValue({ id: 7 })
    const user = userEvent.setup()
    render(ExamsView)

    expect(await screen.findByText('Pedagogía')).toBeVisible()
    expect(screen.getByText('Condición: Libre')).toBeVisible()
    expect(screen.getByText(/Ana Profesor \(Presidente\)/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Inscribirme' }))
    expect(api.enroll).toHaveBeenCalledWith(9, 'LIBRE', 4)
  })

  it('shows backend-published result status and a valid zero grade', async () => {
    api.available.mockResolvedValue([])
    api.mine.mockResolvedValue([{ id: 7, mesaId: 9, materia: { id: 5, nombre: 'Pedagogía' }, fecha: '2026-12-10T12:00:00.000Z', condicion: 'REGULAR', estadoResultado: 'CALIFICADO', nota: 0, aprobado: false, notaMinima: 7 }])

    render(ExamsView)

    expect(await screen.findByText(/Nota: 0/)).toBeVisible()
    expect(screen.getByText('Desaprobado')).toBeVisible()
  })

  it('keeps pending, review and absence states without exposing a note', async () => {
    api.available.mockResolvedValue([])
    api.mine.mockResolvedValue([
      { id: 1, mesaId: 1, materia: { id: 1, nombre: 'Didáctica' }, fecha: '2026-11-01T12:00:00.000Z', condicion: 'REGULAR', estadoResultado: 'PENDIENTE', nota: null, aprobado: null, notaMinima: 6 },
      { id: 2, mesaId: 2, materia: { id: 2, nombre: 'Historia' }, fecha: '2026-11-02T12:00:00.000Z', condicion: 'LIBRE', estadoResultado: 'EN_REVISION', nota: null, aprobado: null, notaMinima: 7 },
      { id: 3, mesaId: 3, materia: { id: 3, nombre: 'Práctica' }, fecha: '2026-11-03T12:00:00.000Z', condicion: 'REGULAR', estadoResultado: 'AUSENTE', nota: null, aprobado: false, notaMinima: 6 },
    ])

    render(ExamsView)

    expect(await screen.findByText('En revisión')).toBeVisible()
    expect(screen.getByText('Pendiente')).toBeVisible()
    expect(screen.getByText('Ausente, sin nota')).toBeVisible()
    expect(screen.queryByText(/Nota:/)).not.toBeInTheDocument()
  })

  it('shows a load error and renders fresh data after a successful retry', async () => {
    api.available.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([availableExam(10, 'Mesa reintentada')])
    api.mine.mockResolvedValue([])
    const user = userEvent.setup()
    render(ExamsView)

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar las mesas de examen.')
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('Mesa reintentada')).toBeVisible()
    expect(api.available).toHaveBeenCalledTimes(2)
    expect(api.mine).toHaveBeenCalledTimes(2)
  })

  it('does not let an older cross-load response overwrite the current role load', async () => {
    const oldAvailable = deferred<AvailableExam[]>()
    const oldMine = deferred<never[]>()
    const currentAvailable = deferred<AvailableExam[]>()
    const currentMine = deferred<never[]>()
    api.available.mockImplementationOnce(() => oldAvailable.promise).mockImplementationOnce(() => currentAvailable.promise)
    api.mine.mockImplementationOnce(() => oldMine.promise).mockImplementationOnce(() => currentMine.promise)
    render(ExamsView)
    await waitFor(() => expect(api.available).toHaveBeenCalledTimes(1))

    authState.activeRole = 'PROFESOR'
    await nextTick()
    authState.activeRole = 'ALUMNO'
    await nextTick()
    await waitFor(() => expect(api.available).toHaveBeenCalledTimes(2))

    currentAvailable.resolve([availableExam(20, 'Mesa vigente')])
    currentMine.resolve([])
    expect(await screen.findByText('Mesa vigente')).toBeVisible()

    oldAvailable.resolve([availableExam(21, 'Mesa vieja')])
    oldMine.resolve([])
    await Promise.resolve()
    await Promise.resolve()

    expect(screen.queryByText('Mesa vieja')).not.toBeInTheDocument()
    expect(screen.getByText('Mesa vigente')).toBeVisible()
  })

  it('does not apply a pending result after the authenticated user changes', async () => {
    const oldAvailable = deferred<AvailableExam[]>()
    const oldMine = deferred<never[]>()
    const currentAvailable = deferred<AvailableExam[]>()
    const currentMine = deferred<never[]>()
    api.available.mockImplementationOnce(() => oldAvailable.promise).mockImplementationOnce(() => currentAvailable.promise)
    api.mine.mockImplementationOnce(() => oldMine.promise).mockImplementationOnce(() => currentMine.promise)
    const view = render(ExamsView)
    await waitFor(() => expect(api.mine).toHaveBeenCalledWith(13))

    authState.user = { idUsuario: 99 }
    await nextTick()
    await waitFor(() => expect(api.mine).toHaveBeenCalledWith(99))

    currentAvailable.resolve([availableExam(31, 'Mesa del usuario actual')])
    currentMine.resolve([])
    expect(await screen.findByText('Mesa del usuario actual')).toBeVisible()

    oldAvailable.resolve([availableExam(30, 'Mesa del usuario anterior')])
    oldMine.resolve([])
    await Promise.resolve()
    await Promise.resolve()

    expect(screen.queryByText('Mesa del usuario anterior')).not.toBeInTheDocument()
    expect(view.container.textContent).toContain('Mesa del usuario actual')
  })

  it('clears student data when changing from ALUMNO to PROFESOR with the same user', async () => {
    api.available.mockResolvedValue([availableExam(50, 'Mesa sensible')])
    api.mine.mockResolvedValue([])
    render(ExamsView)

    expect(await screen.findByText('Mesa sensible')).toBeVisible()
    expect(api.available).toHaveBeenCalledTimes(1)
    expect(api.mine).toHaveBeenCalledTimes(1)

    authState.activeRole = 'PROFESOR'
    await nextTick()

    expect(screen.queryByText('Mesa sensible')).not.toBeInTheDocument()
    expect(api.available).toHaveBeenCalledTimes(1)
    expect(api.mine).toHaveBeenCalledTimes(1)
  })

  it('clears student data when the ALUMNO user becomes null with the same role', async () => {
    api.available.mockResolvedValue([availableExam(51, 'Mesa sensible por usuario')])
    api.mine.mockResolvedValue([])
    render(ExamsView)

    expect(await screen.findByText('Mesa sensible por usuario')).toBeVisible()
    expect(api.available).toHaveBeenCalledTimes(1)
    expect(api.mine).toHaveBeenCalledTimes(1)

    authState.user = null
    await nextTick()

    expect(screen.queryByText('Mesa sensible por usuario')).not.toBeInTheDocument()
    expect(api.available).toHaveBeenCalledTimes(1)
    expect(api.mine).toHaveBeenCalledTimes(1)
  })

  it('does not update after unmount while availability and enrollments are pending', async () => {
    const pendingAvailable = deferred<AvailableExam[]>()
    const pendingMine = deferred<never[]>()
    api.available.mockReturnValue(pendingAvailable.promise)
    api.mine.mockReturnValue(pendingMine.promise)
    const view = render(ExamsView)
    await waitFor(() => expect(api.available).toHaveBeenCalledTimes(1))

    view.unmount()
    pendingAvailable.resolve([availableExam(40, 'Mesa tardía')])
    pendingMine.resolve([])
    await Promise.resolve()
    await Promise.resolve()

    expect(view.container.innerHTML).toBe('')
  })
})
