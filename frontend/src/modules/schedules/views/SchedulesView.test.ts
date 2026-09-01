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

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => { resolve = complete })
  return { promise, resolve }
}

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  mocks.activeRole = 'ALUMNO'
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

  it('lets an administrator publish the first PDF when no schedule exists yet', async () => {
    mocks.activeRole = 'ADMINISTRATIVO'
    mocks.listYears.mockResolvedValue([])
    vi.stubGlobal('URL', { createObjectURL: mocks.createObjectURL, revokeObjectURL: mocks.revokeObjectURL })

    render(SchedulesView)

    expect(await screen.findByText('Todavía no hay horarios publicados.')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Publicar horario' })).toBeVisible()
    expect(screen.getByLabelText('Archivo PDF')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Publicar horario' })).toBeVisible()
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

  it('shows the publishing user for each history version and a clear fallback when it is unavailable', async () => {
    mocks.activeRole = 'ADMINISTRATIVO'
    mockPublishedSchedule()
    mocks.listHistory.mockResolvedValue([
      { ...schedule(2026, 30), vigente: false, publicadoPor: { id: 9, nombre: 'Secretaría Académica' } },
      { ...schedule(2026, 29), vigente: false, publicadoPor: undefined },
    ])
    vi.stubGlobal('URL', { createObjectURL: mocks.createObjectURL, revokeObjectURL: mocks.revokeObjectURL })
    render(SchedulesView)

    await screen.findByRole('heading', { name: 'Horario oficial 2026' })
    expect(screen.getByText('Publicado por: Secretaría Académica')).toBeVisible()
    expect(screen.getByText('Publicado por: Sin dato de publicación')).toBeVisible()
  })

  it('keeps the latest selected year and its Blob URL when older requests resolve later', async () => {
    mockPublishedSchedule()
    const olderSchedule = deferred<Record<string, unknown>>()
    const latestSchedule = deferred<Record<string, unknown>>()
    const olderPdf = deferred<Blob>()
    const latestPdf = deferred<Blob>()
    mocks.getCurrent.mockResolvedValueOnce(schedule(2026))
      .mockImplementationOnce(() => olderSchedule.promise)
      .mockImplementationOnce(() => latestSchedule.promise)
    mocks.download.mockResolvedValueOnce(new Blob(['initial'], { type: 'application/pdf' }))
      .mockImplementationOnce(() => olderPdf.promise)
      .mockImplementationOnce(() => latestPdf.promise)
    mocks.createObjectURL.mockReset()
    mocks.createObjectURL.mockReturnValueOnce('blob:initial').mockReturnValueOnce('blob:latest').mockReturnValueOnce('blob:stale')
    vi.stubGlobal('URL', { createObjectURL: mocks.createObjectURL, revokeObjectURL: mocks.revokeObjectURL })
    const user = userEvent.setup()
    render(SchedulesView)

    await screen.findByRole('heading', { name: 'Horario oficial 2026' })
    await user.selectOptions(screen.getByLabelText('Ciclo lectivo'), '2025')
    await waitFor(() => expect(mocks.getCurrent).toHaveBeenCalledTimes(2))
    olderSchedule.resolve(schedule(2025))
    await waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(2))
    await user.selectOptions(screen.getByLabelText('Ciclo lectivo'), '2026')
    await waitFor(() => expect(mocks.getCurrent).toHaveBeenCalledTimes(3))
    latestSchedule.resolve(schedule(2026, 206))
    await waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(3))
    latestPdf.resolve(new Blob(['latest'], { type: 'application/pdf' }))
    await waitFor(() => expect(screen.getByTitle('Vista previa del horario publicado')).toHaveAttribute('data', 'blob:latest'))

    olderPdf.resolve(new Blob(['stale'], { type: 'application/pdf' }))
    await waitFor(() => expect(screen.getByTitle('Vista previa del horario publicado')).toHaveAttribute('data', 'blob:latest'))
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:initial')
    expect(mocks.createObjectURL).toHaveBeenCalledTimes(2)
  })

  it('shows a retryable PDF error to non-administrative users and retries the download', async () => {
    mockPublishedSchedule()
    mocks.download.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(new Blob(['recovered'], { type: 'application/pdf' }))
    mocks.createObjectURL.mockReset()
    mocks.createObjectURL.mockReturnValue('blob:recovered')
    vi.stubGlobal('URL', { createObjectURL: mocks.createObjectURL, revokeObjectURL: mocks.revokeObjectURL })
    const user = userEvent.setup()
    render(SchedulesView)

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos descargar el PDF publicado.')
    await user.click(screen.getByRole('button', { name: 'Reintentar PDF' }))
    await waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByTitle('Vista previa del horario publicado')).toHaveAttribute('data', 'blob:recovered'))
  })

  it('loads a newly selected year after retrying the current-schedule load for the same year', async () => {
    mocks.listYears.mockResolvedValue([2026, 2025])
    mocks.getCurrent.mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(schedule(2026))
      .mockResolvedValueOnce(schedule(2025))
    mocks.download.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }))
    mocks.createObjectURL.mockReturnValueOnce('blob:2026').mockReturnValueOnce('blob:2025')
    vi.stubGlobal('URL', { createObjectURL: mocks.createObjectURL, revokeObjectURL: mocks.revokeObjectURL })
    const user = userEvent.setup()
    render(SchedulesView)

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar el horario para el ciclo lectivo seleccionado.')
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    await screen.findByRole('heading', { name: 'Horario oficial 2026' })
    await user.selectOptions(screen.getByLabelText('Ciclo lectivo'), '2025')

    await waitFor(() => expect(mocks.getCurrent).toHaveBeenCalledTimes(3))
    expect(await screen.findByRole('heading', { name: 'Horario oficial 2025' })).toBeVisible()
    await waitFor(() => expect(screen.getByTitle('Vista previa del horario publicado')).toHaveAttribute('data', 'blob:2025'))
  })

  it('keeps a pending administrative history request valid while a PDF retry completes', async () => {
    mocks.activeRole = 'ADMINISTRATIVO'
    const versions = deferred<Array<Record<string, unknown>>>()
    mocks.listYears.mockResolvedValue([2026])
    mocks.getCurrent.mockResolvedValue(schedule(2026))
    mocks.download.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(new Blob(['recovered'], { type: 'application/pdf' }))
    mocks.listHistory.mockImplementationOnce(() => versions.promise)
    mocks.createObjectURL.mockReturnValue('blob:recovered')
    vi.stubGlobal('URL', { createObjectURL: mocks.createObjectURL, revokeObjectURL: mocks.revokeObjectURL })
    const user = userEvent.setup()
    render(SchedulesView)

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos descargar el PDF publicado.')
    await user.click(screen.getByRole('button', { name: 'Reintentar PDF' }))
    await waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(2))
    versions.resolve([{ ...schedule(2026, 30), vigente: false, publicadoPor: { id: 9, nombre: 'Secretaría Académica' } }])

    expect(await screen.findByText('Publicado por: Secretaría Académica')).toBeVisible()
  })
})
