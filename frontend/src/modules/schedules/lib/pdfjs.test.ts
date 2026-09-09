import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Blob as NodeBlob } from 'node:buffer'

const { getDocument, GlobalWorkerOptions } = vi.hoisted(() => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: { workerSrc: undefined as string | undefined },
}))

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions,
  getDocument,
}))

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: '/assets/pdf.worker.min.mjs',
}))

import { createPdfLoadingTask } from './pdfjs'

describe('createPdfLoadingTask', () => {
  beforeEach(() => {
    getDocument.mockReset()
  })

  it('configures the local worker and forwards the Blob bytes to PDF.js', async () => {
    const loadingTask = { promise: Promise.resolve() }
    getDocument.mockReturnValue(loadingTask)
    const file = new NodeBlob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' })

    const result = await createPdfLoadingTask(file)

    expect(GlobalWorkerOptions.workerSrc).toBe('/assets/pdf.worker.min.mjs')
    expect(getDocument).toHaveBeenCalledOnce()
    expect(getDocument).toHaveBeenCalledWith({ data: new Uint8Array([1, 2, 3]) })
    expect(result).toBe(loadingTask)
  })
})
