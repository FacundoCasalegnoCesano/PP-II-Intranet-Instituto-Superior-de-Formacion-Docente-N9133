import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentLoadingTask,
} from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export async function createPdfLoadingTask(file: Blob): Promise<PDFDocumentLoadingTask> {
  const data = new Uint8Array(await file.arrayBuffer())
  return getDocument({ data })
}
