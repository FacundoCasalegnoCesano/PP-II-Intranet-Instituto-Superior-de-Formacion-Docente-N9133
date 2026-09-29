import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, cleanup, within } from '@testing-library/vue'
import { flushPromises } from '@vue/test-utils'
import AcademicRecordView from './AcademicRecordView.vue'
import { fetchAcademicRecordAttendance, fetchAcademicRecordCareers, fetchAcademicRecordTrajectory } from '../api/academicRecordApi'

const authState = vi.hoisted(() => ({ user: { idUsuario: 13 } as { idUsuario: number } | null, activeRole: 'ALUMNO' as string | null }))
const authHolder = vi.hoisted(() => ({ value: null as { user: { idUsuario: number } | null, activeRole: string | null } | null }))
vi.mock('@/stores/authStore', async () => {
  const { reactive } = await import('vue')
  const auth = reactive(authState)
  authHolder.value = auth
  return { useAuthStore: () => auth }
})
const routerStubs = { RouterLink: { template: '<a><slot /></a>' } }
vi.mock('../api/academicRecordApi', () => ({ fetchAcademicRecordCareers: vi.fn(), fetchAcademicRecordTrajectory: vi.fn(), fetchAcademicRecordAttendance: vi.fn() }))

const careerRows = [
  { id: 1, carreraId: 3, activo: true, carrera: { id: 3, nombre: 'Profesorado', activo: true, materias: [] } },
  { id: 2, carreraId: 4, activo: true, carrera: { id: 4, nombre: 'Tecnicatura', activo: true, materias: [] } },
]
function trajectory(carreraId: number, nombre: string, asistencia = 80) {
  return { alumnoUsuarioId: 13, carrera: { id: carreraId, nombre }, promedioGeneral: carreraId === 3 ? 8.5 : 7, cantidadMateriasAprobadas: 1, materias: [{ materia: { id: carreraId, nombre: carreraId === 3 ? 'Pedagogía' : 'Historia' }, estado: 'REGULAR', plan: { anio: 1 }, asistencia: { porcentaje: asistencia }, cursadas: [{ cursadaId: carreraId * 10, anioLectivo: 2026, periodo: 'ANUAL', asistencia: { porcentaje: asistencia } }, { cursadaId: carreraId * 10 + 1, anioLectivo: 2025, periodo: 'ANUAL', asistencia: { porcentaje: 60 } }], regularidad: { hasta: '2027-12-31T00:00:00.000Z', vencida: false }, definitiva: null }] }
}
function attendance(cursadaId: number, page = 1) {
  return { data: [{ cursadaId, materia: { id: cursadaId, nombre: 'Pedagogía' }, anioLectivo: cursadaId === 30 ? 2026 : 2025, periodo: 'ANUAL', fecha: cursadaId === 31 ? '2025-04-06' : page === 1 ? '2026-04-06' : '2026-05-06', presente: page === 1, justificado: false }], pagination: { page, limit: 20, total: 21, totalPages: 2 } }
}
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason?: unknown) => void; const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej }); return { promise, resolve, reject } }

beforeEach(() => {
  authHolder.value!.user = { idUsuario: 13 }
  authHolder.value!.activeRole = 'ALUMNO'
  vi.resetAllMocks()
  vi.mocked(fetchAcademicRecordCareers).mockResolvedValue(careerRows as never)
  vi.mocked(fetchAcademicRecordTrajectory).mockImplementation(async (_userId, careerId) => trajectory(careerId, careerId === 3 ? 'Profesorado' : 'Tecnicatura') as never)
  vi.mocked(fetchAcademicRecordAttendance).mockImplementation(async (_userId, options) => attendance(options.cursadaId, options.page ?? 1) as never)
})
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers() })

describe('AcademicRecordView', () => {
  it('shows only current regularities through 90 calendar days, ordered by deadline', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-29T00:30:00.000Z'))
    vi.mocked(fetchAcademicRecordTrajectory).mockResolvedValue({
      alumnoUsuarioId: 13,
      carrera: { id: 3, nombre: 'Profesorado' },
      materias: [
        { materia: { id: 1, nombre: 'Límite 90' }, estado: 'REGULAR', regularidad: { hasta: '2026-12-27', vencida: false }, definitiva: null },
        { materia: { id: 2, nombre: 'Hoy' }, estado: 'REGULAR', regularidad: { hasta: '2026-09-28T00:00:00.000Z', vencida: false }, definitiva: null },
        { materia: { id: 3, nombre: 'Límite 91' }, estado: 'REGULAR', regularidad: { hasta: '2026-12-28', vencida: false }, definitiva: null },
        { materia: { id: 4, nombre: 'Vencida' }, estado: 'REGULAR', regularidad: { hasta: '2026-09-28', vencida: true }, definitiva: null },
        { materia: { id: 5, nombre: 'Libre' }, estado: 'LIBRE', regularidad: { hasta: '2026-10-01', vencida: false }, definitiva: null },
        { materia: { id: 6, nombre: 'En curso' }, estado: 'EN_CURSO', regularidad: { hasta: '2026-10-01', vencida: false }, definitiva: null },
        { materia: { id: 7, nombre: 'Promocionada' }, estado: 'PROMOCIONADO', regularidad: { hasta: '2026-10-01', vencida: false }, definitiva: null },
        { materia: { id: 8, nombre: 'Definitiva' }, estado: 'REGULAR', regularidad: { hasta: '2026-10-01', vencida: false }, definitiva: { nota: 8, via: 'EXAMEN_FINAL' } },
        { materia: { id: 9, nombre: 'Sin fecha' }, estado: 'REGULAR', regularidad: { hasta: null, vencida: false }, definitiva: null },
        { materia: { id: 10, nombre: 'Fecha inválida' }, estado: 'REGULAR', regularidad: { hasta: '2026-02-30', vencida: false }, definitiva: null },
      ],
    } as never)
    render(AcademicRecordView, { global: { stubs: routerStubs } })
    const alerts = await screen.findByRole('region', { name: 'Regularidades próximas a vencer' })
    expect(within(alerts).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      expect.stringContaining('Hoy'),
      expect.stringContaining('Límite 90'),
    ])
    expect(within(alerts).getByText(/vence hoy/)).toBeVisible()
    expect(within(alerts).getByText(/90 días restantes/)).toBeVisible()
    for (const excluded of ['Límite 91', 'Vencida', 'Libre', 'En curso', 'Promocionada', 'Definitiva', 'Sin fecha', 'Fecha inválida']) expect(within(alerts).queryByText(excluded)).not.toBeInTheDocument()
  })

  it('clears alerts from the previous career after changing career', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-29T15:00:00.000Z'))
    vi.mocked(fetchAcademicRecordTrajectory).mockImplementation(async (_userId, careerId) => careerId === 3
      ? { ...trajectory(3, 'Profesorado'), materias: [{ materia: { id: 30, nombre: 'Sólo Profesorado' }, estado: 'REGULAR', regularidad: { hasta: '2026-10-01', vencida: false }, definitiva: null }] } as never
      : trajectory(4, 'Tecnicatura') as never)
    render(AcademicRecordView, { global: { stubs: routerStubs } })
    expect(await screen.findByRole('heading', { name: 'Sólo Profesorado', level: 2 })).toBeVisible()
    expect(screen.getByRole('region', { name: 'Regularidades próximas a vencer' })).toBeVisible()
    await fireEvent.update(screen.getByLabelText('Carrera'), '4')
    await screen.findByText('Historia')
    expect(screen.queryByRole('region', { name: 'Regularidades próximas a vencer' })).not.toBeInTheDocument()
    expect(screen.queryByText('Sólo Profesorado')).not.toBeInTheDocument()
  })

  it('loads one trajectory initially and attendance only after expanding', async () => {
    render(AcademicRecordView, { global: { stubs: routerStubs } })
    await screen.findByText('Pedagogía')
    expect(fetchAcademicRecordTrajectory).toHaveBeenCalledTimes(1)
    expect(fetchAcademicRecordAttendance).not.toHaveBeenCalled()
    await fireEvent.click(screen.getByRole('button', { name: 'Ver asistencias' }))
    expect(await screen.findByText('6/4/2026')).toBeVisible()
    expect(fetchAcademicRecordAttendance).toHaveBeenCalledTimes(1)
  })

  it('uses the selected historical course percentage and rows without observations', async () => {
    render(AcademicRecordView, { global: { stubs: routerStubs } })
    await screen.findByText('Pedagogía')
    await fireEvent.click(screen.getByRole('button', { name: 'Ver asistencias' }))
    await screen.findByText('6/4/2026')
    await fireEvent.update(screen.getByLabelText('Cursada'), '31')
    expect(screen.getByText('2025 · Anual · 60%')).toBeVisible()
    expect(await screen.findByText('6/4/2025')).toBeVisible()
    expect(screen.getByText('Asistencia: 80%')).toBeVisible()
    expect(screen.queryByText(/observaci/i)).not.toBeInTheDocument()
  })

  it('hides the old paginator while page two fails and retries page two', async () => {
    const pageTwo = deferred<ReturnType<typeof attendance>>()
    vi.mocked(fetchAcademicRecordAttendance).mockResolvedValueOnce(attendance(30, 1) as never).mockRejectedValueOnce(new Error('fallo')).mockResolvedValueOnce(pageTwo.promise as never)
    render(AcademicRecordView, { global: { stubs: routerStubs } })
    await screen.findByText('Pedagogía')
    await fireEvent.click(screen.getByRole('button', { name: 'Ver asistencias' }))
    await screen.findByText('Página 1 de 2')
    await fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(screen.queryByText('Página 1 de 2')).not.toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar las asistencias.')
    expect(screen.queryByText('Página 1 de 2')).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(fetchAcademicRecordAttendance).toHaveBeenNthCalledWith(3, 13, { carreraId: 3, cursadaId: 30, page: 2 })
    expect(screen.queryByText('Página 1 de 2')).not.toBeInTheDocument()
    pageTwo.resolve(attendance(30, 2))
    expect(await screen.findByText('Página 2 de 2')).toBeVisible()
  })

  it('ignores deferred attendance from the old course and trajectory from the old career', async () => {
    const oldAttendance = deferred<ReturnType<typeof attendance>>(); const newAttendance = deferred<ReturnType<typeof attendance>>()
    vi.mocked(fetchAcademicRecordAttendance).mockReturnValueOnce(oldAttendance.promise as never).mockReturnValueOnce(newAttendance.promise as never)
    const oldTrajectory = deferred<ReturnType<typeof trajectory>>(); const newTrajectory = deferred<ReturnType<typeof trajectory>>()
    vi.mocked(fetchAcademicRecordTrajectory).mockReturnValueOnce(oldTrajectory.promise as never).mockReturnValueOnce(newTrajectory.promise as never)
    render(AcademicRecordView, { global: { stubs: routerStubs } })
    oldTrajectory.resolve(trajectory(3, 'Profesorado'))
    await screen.findByText('Pedagogía')
    await fireEvent.click(screen.getByRole('button', { name: 'Ver asistencias' }))
    await fireEvent.update(screen.getByLabelText('Cursada'), '31')
    newAttendance.resolve(attendance(31))
    expect(await screen.findByText('6/4/2025')).toBeVisible()
    oldAttendance.resolve(attendance(30))
    await flushPromises()
    expect(screen.getByText('6/4/2025')).toBeVisible()
    expect(screen.queryByText('6/4/2026')).not.toBeInTheDocument()
    await fireEvent.update(screen.getByLabelText('Carrera'), '4')
    newTrajectory.resolve(trajectory(4, 'Tecnicatura', 70))
    expect(await screen.findByText('Historia')).toBeVisible()
    expect(screen.queryByText('Pedagogía')).not.toBeInTheDocument()
  })

  it('does not repopulate after logout or role change while a request is pending', async () => {
    const pending = deferred<ReturnType<typeof trajectory>>()
    vi.mocked(fetchAcademicRecordTrajectory).mockReturnValueOnce(pending.promise as never)
    render(AcademicRecordView, { global: { stubs: routerStubs } })
    await vi.waitFor(() => expect(fetchAcademicRecordTrajectory).toHaveBeenCalledTimes(1))
    authHolder.value!.user = null
    authHolder.value!.activeRole = null
    await vi.waitFor(() => expect(screen.getByText('No tenés carreras activas para consultar.')).toBeVisible())
    pending.resolve(trajectory(3, 'Profesorado'))
    await Promise.resolve()
    expect(screen.queryByText('Pedagogía')).not.toBeInTheDocument()
  })
})
