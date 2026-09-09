import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import type { Component } from 'vue'

const mocks = vi.hoisted(() => ({
  createPdfLoadingTask: vi.fn(),
  getContext: vi.fn(),
}))

vi.mock('../lib/pdfjs', () => ({
  createPdfLoadingTask: mocks.createPdfLoadingTask,
}))

import SchedulePdfViewer from './SchedulePdfViewer.vue'

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

type RenderTaskDouble = {
  promise: Promise<void>
  cancel: ReturnType<typeof vi.fn>
}

type PageDouble = {
  getViewport: ReturnType<typeof vi.fn>
  render: ReturnType<typeof vi.fn>
}

type DocumentDouble = {
  numPages: number
  getPage: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
}

type LoadingTaskDouble = {
  promise: Promise<DocumentDouble>
  destroy: ReturnType<typeof vi.fn>
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete
    reject = fail
  })
  return { promise, resolve, reject }
}

function createPdfDouble(options: {
  pages?: number
  renderPromise?: Promise<void>
} = {}) {
  const renderTask: RenderTaskDouble = {
    promise: options.renderPromise ?? Promise.resolve(),
    cancel: vi.fn(),
  }
  const page: PageDouble = {
    getViewport: vi.fn(({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale })),
    render: vi.fn(() => renderTask),
  }
  const document: DocumentDouble = {
    numPages: options.pages ?? 3,
    getPage: vi.fn().mockResolvedValue(page),
    destroy: vi.fn().mockResolvedValue(undefined),
  }
  const loadingTask: LoadingTaskDouble = {
    promise: Promise.resolve(document),
    destroy: vi.fn().mockResolvedValue(undefined),
  }

  return { loadingTask, document, page, renderTask }
}

function createPageDouble(options: {
  width: number
  height: number
  renderPromise?: Promise<void>
}) {
  const renderTask: RenderTaskDouble = {
    promise: options.renderPromise ?? Promise.resolve(),
    cancel: vi.fn(),
  }
  const page: PageDouble = {
    getViewport: vi.fn(({ scale }: { scale: number }) => ({ width: options.width * scale, height: options.height * scale })),
    render: vi.fn(() => renderTask),
  }

  return { page, renderTask }
}

function renderViewer(file = new Blob(['horario'], { type: 'application/pdf' })) {
  return render(SchedulePdfViewer as Component, { props: { file } })
}

async function waitForCanvas() {
  const canvas = await screen.findByRole('img', { name: 'Página 1 del horario' })
  await waitFor(() => expect(canvas.parentElement).toHaveAttribute('aria-busy', 'false'))
  return canvas
}

beforeEach(() => {
  mocks.createPdfLoadingTask.mockReset()
  mocks.getContext.mockReset().mockReturnValue({})
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(mocks.getContext)
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SchedulePdfViewer', () => {
  it('loads a Blob, renders page 1, and sizes its canvas at device-pixel-ratio quality', async () => {
    const pdf = createPdfDouble()
    const file = new Blob(['horario'], { type: 'application/pdf' })
    mocks.createPdfLoadingTask.mockResolvedValue(pdf.loadingTask)

    renderViewer(file)
    const canvas = await waitForCanvas()

    expect(mocks.createPdfLoadingTask).toHaveBeenCalledWith(file)
    expect(pdf.document.getPage).toHaveBeenCalledWith(1)
    expect(pdf.page.getViewport).toHaveBeenCalledWith({ scale: 1 })
    expect(pdf.page.render).toHaveBeenCalledWith(expect.objectContaining({
      canvasContext: expect.any(Object),
      transform: [2, 0, 0, 2, 0, 0],
    }))
    expect(canvas).toHaveAttribute('width', '1200')
    expect(canvas).toHaveAttribute('height', '1600')
    expect(canvas).toHaveStyle({ width: '600px', height: '800px' })
  })

  it('exposes only the approved PDF controls', async () => {
    const pdf = createPdfDouble()
    mocks.createPdfLoadingTask.mockResolvedValue(pdf.loadingTask)

    renderViewer()
    await waitForCanvas()
    const controls = screen.getByRole('region', { name: 'Controles del PDF' })

    expect(within(controls).getByRole('button', { name: 'Página anterior' })).toBeDisabled()
    expect(within(controls).getByRole('button', { name: 'Página siguiente' })).toBeEnabled()
    expect(within(controls).getByRole('button', { name: 'Alejar' })).toBeEnabled()
    expect(within(controls).getByRole('button', { name: 'Acercar' })).toBeEnabled()
    expect(within(controls).getByRole('spinbutton', { name: 'Página' })).toHaveAttribute('type', 'number')
    expect(within(controls).getByRole('status', { name: 'Total de páginas' })).toHaveTextContent('de 3')
    expect(within(controls).getByRole('status', { name: 'Nivel de zoom' })).toHaveTextContent('100 %')
    expect(within(controls).getAllByRole('button').map((button) => button.textContent?.trim())).toEqual([
      'Página anterior',
      'Página siguiente',
      'Alejar',
      'Acercar',
    ])
    for (const forbiddenControl of ['Imprimir', 'Descargar', 'Buscar', 'Comentario', 'Dibujar', 'Firmar', 'Imagen', 'Texto', 'Editar', 'Más acciones']) {
      expect(controls).not.toHaveTextContent(forbiddenControl)
    }
  })

  it('keeps navigation and direct page input within document boundaries', async () => {
    const pdf = createPdfDouble({ pages: 3 })
    mocks.createPdfLoadingTask.mockResolvedValue(pdf.loadingTask)
    const user = userEvent.setup()

    renderViewer()
    const input = await screen.findByLabelText('Página') as HTMLInputElement
    const previous = screen.getByRole('button', { name: 'Página anterior' })
    const next = screen.getByRole('button', { name: 'Página siguiente' })

    expect(previous).toBeDisabled()
    await user.click(next)
    await waitFor(() => expect(input.value).toBe('2'))
    await user.click(next)
    await waitFor(() => expect(input.value).toBe('3'))
    expect(next).toBeDisabled()

    for (const invalidPage of ['0', '-1', '1.5', '5']) {
      fireEvent.update(input, invalidPage)
      fireEvent.blur(input)
      await waitFor(() => expect(input.value).toBe('3'))
    }

    await user.clear(input)
    await user.tab()
    expect(input.value).toBe('3')

    await user.clear(input)
    await user.type(input, '2')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(input.value).toBe('2'))
    expect(pdf.document.getPage).toHaveBeenLastCalledWith(2)
  })

  it('uses the exact zoom levels and disables controls at their limits', async () => {
    const pdf = createPdfDouble()
    mocks.createPdfLoadingTask.mockResolvedValue(pdf.loadingTask)
    const user = userEvent.setup()

    renderViewer()
    await waitForCanvas()
    const zoomOut = screen.getByRole('button', { name: 'Alejar' })
    const zoomIn = screen.getByRole('button', { name: 'Acercar' })

    expect(screen.getByText('100 %')).toBeVisible()
    await user.click(zoomOut)
    expect(screen.getByText('75 %')).toBeVisible()
    await user.click(zoomOut)
    await waitFor(() => expect(zoomOut).toBeDisabled())
    expect(screen.getByText('50 %')).toBeVisible()

    for (const expectedZoom of ['75 %', '100 %', '125 %', '150 %', '175 %', '200 %']) {
      await user.click(zoomIn)
      expect(screen.getByText(expectedZoom)).toBeVisible()
    }
    expect(zoomIn).toBeDisabled()
  })

  it('cancels the previous canvas render before starting a replacement render', async () => {
    const pdf = createPdfDouble()
    mocks.createPdfLoadingTask.mockResolvedValue(pdf.loadingTask)
    const user = userEvent.setup()

    renderViewer()
    await waitForCanvas()
    await user.click(screen.getByRole('button', { name: 'Acercar' }))

    await waitFor(() => expect(pdf.renderTask.cancel).toHaveBeenCalledOnce())
    expect(pdf.page.render).toHaveBeenCalledTimes(2)
  })

  it('ignores rendering cancellation but exposes real errors with a retry action', async () => {
    const cancelledRender = deferred<void>()
    const cancellation = createPdfDouble({ renderPromise: cancelledRender.promise })
    mocks.createPdfLoadingTask.mockResolvedValueOnce(cancellation.loadingTask)

    renderViewer()
    await waitFor(() => expect(cancellation.page.render).toHaveBeenCalledOnce())
    cancelledRender.reject({ name: 'RenderingCancelledException' })
    await Promise.resolve()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    const failed = createPdfDouble({ renderPromise: Promise.reject(new Error('canvas failure')) })
    mocks.createPdfLoadingTask.mockResolvedValue(failed.loadingTask)
    const user = userEvent.setup()
    const view = renderViewer(new Blob(['fallido'], { type: 'application/pdf' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos mostrar la vista previa del horario.')
    await user.click(screen.getByRole('button', { name: 'Reintentar vista previa' }))
    await waitFor(() => expect(failed.page.render).toHaveBeenCalledTimes(2))
    view.unmount()
  })

  it('does not let a stale page or zoom render replace the newest canvas state', async () => {
    const pdf = createPdfDouble()
    const stalePage = deferred<PageDouble>()
    const latestRender = deferred<void>()
    const latest = createPageDouble({ width: 600, height: 800, renderPromise: latestRender.promise })
    const older = createPageDouble({ width: 100, height: 200 })
    mocks.createPdfLoadingTask.mockResolvedValue(pdf.loadingTask)
    const user = userEvent.setup()

    renderViewer()
    const canvas = await waitForCanvas() as HTMLCanvasElement
    pdf.document.getPage.mockImplementationOnce(() => stalePage.promise).mockResolvedValueOnce(latest.page)
    await user.click(screen.getByRole('button', { name: 'Acercar' }))
    await waitFor(() => expect(pdf.document.getPage).toHaveBeenCalledTimes(2))
    await user.click(screen.getByRole('button', { name: 'Acercar' }))
    await waitFor(() => expect(pdf.document.getPage).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(latest.page.render).toHaveBeenCalledOnce())

    stalePage.resolve(older.page)
    await Promise.resolve()

    expect(older.page.getViewport).not.toHaveBeenCalled()
    expect(canvas).toHaveStyle({ width: '900px', height: '1200px' })
    expect(canvas.parentElement).toHaveAttribute('aria-busy', 'true')

    latestRender.resolve()
    await waitFor(() => expect(canvas.parentElement).toHaveAttribute('aria-busy', 'false'))
  })

  it('keeps the preview busy until a newer zoom render completes during the initial load', async () => {
    const initialRender = deferred<void>()
    const newestRender = deferred<void>()
    const pdf = createPdfDouble()
    const initialTask: RenderTaskDouble = { promise: initialRender.promise, cancel: vi.fn() }
    const newestTask: RenderTaskDouble = { promise: newestRender.promise, cancel: vi.fn() }
    pdf.page.render.mockReset().mockReturnValueOnce(initialTask).mockReturnValueOnce(newestTask)
    mocks.createPdfLoadingTask.mockResolvedValue(pdf.loadingTask)
    const user = userEvent.setup()

    renderViewer()
    const canvas = await screen.findByRole('img', { name: 'Página 1 del horario' })
    await waitFor(() => expect(pdf.page.render).toHaveBeenCalledTimes(1))
    await user.click(screen.getByRole('button', { name: 'Acercar' }))
    await waitFor(() => expect(pdf.page.render).toHaveBeenCalledTimes(2))

    initialRender.resolve()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(canvas.parentElement).toHaveAttribute('aria-busy', 'true')

    newestRender.resolve()
    await waitFor(() => expect(canvas.parentElement).toHaveAttribute('aria-busy', 'false'))
  })

  it('waits for active PDF cleanup before loading a replacement Blob', async () => {
    const documentDestroy = deferred<void>()
    const loadingTaskDestroy = deferred<void>()
    const initial = createPdfDouble()
    initial.document.destroy.mockReturnValue(documentDestroy.promise)
    initial.loadingTask.destroy.mockReturnValue(loadingTaskDestroy.promise)
    const replacement = createPdfDouble()
    mocks.createPdfLoadingTask.mockResolvedValueOnce(initial.loadingTask).mockResolvedValueOnce(replacement.loadingTask)
    const firstFile = new Blob(['primero'], { type: 'application/pdf' })
    const secondFile = new Blob(['segundo'], { type: 'application/pdf' })
    const view = renderViewer(firstFile)
    await waitForCanvas()

    await view.rerender({ file: secondFile })
    await waitFor(() => expect(initial.document.destroy).toHaveBeenCalledOnce())
    expect(mocks.createPdfLoadingTask).toHaveBeenCalledTimes(1)

    documentDestroy.resolve()
    await Promise.resolve()
    expect(mocks.createPdfLoadingTask).toHaveBeenCalledTimes(1)

    loadingTaskDestroy.resolve()
    await waitFor(() => expect(mocks.createPdfLoadingTask).toHaveBeenCalledTimes(2))
  })

  it('invalidates stale work and resets page and zoom when the Blob changes', async () => {
    const staleDocument = deferred<DocumentDouble>()
    const staleTask: LoadingTaskDouble = { promise: staleDocument.promise, destroy: vi.fn().mockResolvedValue(undefined) }
    const replacement = createPdfDouble()
    mocks.createPdfLoadingTask.mockResolvedValueOnce(staleTask).mockResolvedValueOnce(replacement.loadingTask)
    const firstFile = new Blob(['primero'], { type: 'application/pdf' })
    const secondFile = new Blob(['segundo'], { type: 'application/pdf' })
    const view = renderViewer(firstFile)

    await waitFor(() => expect(mocks.createPdfLoadingTask).toHaveBeenCalledWith(firstFile))
    await view.rerender({ file: secondFile })
    await waitForCanvas()
    expect(staleTask.destroy).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('Página')).toHaveValue(1)
    expect(screen.getByText('100 %')).toBeVisible()

    staleDocument.resolve(createPdfDouble().document)
    await Promise.resolve()
    expect(replacement.document.getPage).toHaveBeenCalledWith(1)
  })

  it('destroys active PDF resources and clears the canvas when unmounted', async () => {
    const pdf = createPdfDouble()
    mocks.createPdfLoadingTask.mockResolvedValue(pdf.loadingTask)
    const view = renderViewer()
    const canvas = await waitForCanvas() as HTMLCanvasElement

    view.unmount()

    expect(pdf.renderTask.cancel).toHaveBeenCalledOnce()
    await waitFor(() => expect(pdf.loadingTask.destroy).toHaveBeenCalledOnce())
    expect(pdf.document.destroy).toHaveBeenCalledOnce()
    expect(canvas.width).toBe(0)
    expect(canvas.height).toBe(0)
  })
})
