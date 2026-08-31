import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import SchedulesView from './SchedulesView.vue'

const mocks = vi.hoisted(() => ({
  activeRole: 'ALUMNO' as 'ALUMNO' | 'ADMINISTRATIVO',
  listYears: vi.fn(),
  getCurrent: vi.fn(),
  download: vi.fn(),
  publish: vi.fn(),
  listHistory: vi.fn(),
  restore: vi.fn(),
  createObjectURL: vi.fn(),
  revokeObjectURL: vi.fn(),
}))

vi.mock('@/stores/authStore', () => ({ useAuthStore: () => ({ activeRole: mocks.activeRole }) }))
vi.mock('../api/schedulesApi', () => ({
  schedulesApi: {
    listYears: mocks.listYears,
    getCurrent: mocks.getCurrent,
    download: mocks.download,
    publish: mocks.publish,
    listHistory: mocks.listHistory,
    restore: mocks.restore,
  },
}))

function schedule(cicloLectivo = 2026, id = cicloLectivo): Record<string, unknown> {
  return {
    id,
    cicloLectivo,
    titulo: `Horario oficial ${cicloLectivo}`,
    nombreOriginal: `horario-${cicloLectivo}.pdf`,
    tamanio: 2048,
    fechaPublicacion: '2026-08-31T12:00:00.000Z',
    vigente: true,
    publicadoPor: { id: 7, nombre: 'Admin Instituto' },
  }
}

function mockPublishedSchedule() {
  mocks.listYears.mockResolvedValue([2026, 2025])
  mocks.getCurrent.mockImplementation((year?: number) => Promise.resolve(schedule(year ?? 2026)))
  mocks.download.mockResolvedValue(new Blob(['%PDF-1.7'], { type: 'application/pdf' }))
  mocks.listHistory.mockResolvedValue([{ ...schedule(2026, 30), vigente: false }, schedule()])
  mocks.publish.mockResolvedValue({ documento: schedule(), reutilizado: false })
  mocks.restore.mockResolvedValue(schedule())
  mocks.createObjectURL.mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second').mockReturnValue('blob:next')
}

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('SchedulesView', () => {
  it('loads a chosen published year and revokes each replaced or unmounted PDF URL', async () => {
    mockPublishedSchedule()
    vi.stubGlobal('URL', { createObjectURL: mocks.createObjectURL, revokeObjectURL: mocks.revokeObjectURL })
    const user = userEvent.setup()
    const view = render(SchedulesView)

    await screen.findByRole('heading', { name: 'Horario oficial 2026' })
    expect(screen.getByTitle('Vista previa del horario publicado')).toHaveAttribute('data', 'blob:first')
    await user.selectOptions(screen.getByLabelText('Ciclo lectivo'), '2025')
    await screen.findByRole('heading', { name: 'Horario oficial 2025' })

    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:first')
    view.unmount()
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:second')
  })

  it('shows empty and retryable error states without a PDF preview', async () => {
    mocks.listYears.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([2026])
    vi.stubGlobal('URL', { createObjectURL: mocks.createObjectURL, revokeObjectURL: mocks.revokeObjectURL })
    const empty = render(SchedulesView)
    expect(await screen.findByText('Todavía no hay horarios publicados.')).toBeVisible()
    empty.unmount()

    const failed = render(SchedulesView)
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los horarios publicados.')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(mocks.listYears).toHaveBeenCalledTimes(3))
  })

  it('keeps management controls and restore confirmation exclusive to administrative staff', async () => {
    mocks.activeRole = 'ALUMNO'
    mockPublishedSchedule()
    vi.stubGlobal('URL', { createObjectURL: mocks.createObjectURL, revokeObjectURL: mocks.revokeObjectURL })
    const student = render(SchedulesView)
    await screen.findByRole('heading', { name: 'Horario oficial 2026' })
    expect(screen.queryByText('Publicar horario')).not.toBeInTheDocument()
    student.unmount()

    mocks.activeRole = 'ADMINISTRATIVO'
    mockPublishedSchedule()
    const user = userEvent.setup()
    render(SchedulesView)
    await screen.findByRole('heading', { name: 'Horario oficial 2026' })
    expect(screen.getByRole('heading', { name: 'Publicar horario' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Volver a publicar' }))
    expect(screen.getByRole('alertdialog', { name: 'Volver a publicar versión' })).toBeVisible()
  })
})
