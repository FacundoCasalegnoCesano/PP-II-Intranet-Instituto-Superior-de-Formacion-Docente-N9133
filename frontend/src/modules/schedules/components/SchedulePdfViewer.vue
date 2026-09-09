<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { createPdfLoadingTask } from '../lib/pdfjs'

const MIN_ZOOM = 50
const MAX_ZOOM = 200
const ZOOM_LEVELS = [50, 75, 100, 125, 150, 175, 200]

const props = defineProps<{ file: Blob }>()

const canvas = ref<HTMLCanvasElement>()
const currentPage = ref(1)
const pageInput = ref('1')
const totalPages = ref(0)
const zoom = ref(100)
const loading = ref(false)
const error = ref('')
const pageInputId = useId()

let activeLoadingTask: PDFDocumentLoadingTask | undefined
let activeDocument: PDFDocumentProxy | undefined
let activeRenderTask: RenderTask | undefined
let generation = 0
let renderSequence = 0
let pendingCleanup = Promise.resolve()

const canGoPrevious = computed(() => currentPage.value > 1)
const canGoNext = computed(() => currentPage.value < totalPages.value)
const canZoomOut = computed(() => zoom.value > MIN_ZOOM)
const canZoomIn = computed(() => zoom.value < MAX_ZOOM)

function clearCanvas() {
  if (!canvas.value) return
  canvas.value.width = 0
  canvas.value.height = 0
  canvas.value.style.width = ''
  canvas.value.style.height = ''
}

function isRenderCancellation(reason: unknown) {
  return typeof reason === 'object' && reason !== null && 'name' in reason
    && reason.name === 'RenderingCancelledException'
}

function resetState() {
  currentPage.value = 1
  pageInput.value = '1'
  totalPages.value = 0
  zoom.value = 100
  error.value = ''
  clearCanvas()
}

async function destroySilently(resource: { destroy: () => Promise<void> } | undefined) {
  if (!resource) return
  try {
    await resource.destroy()
  } catch {
    // La limpieza no debe bloquear ni volver a mostrar un error de vista previa.
  }
}

function disposeResources() {
  try {
    activeRenderTask?.cancel()
  } catch {
    // La tarea de renderizado puede haber terminado antes de cancelarse.
  }
  activeRenderTask = undefined

  const document = activeDocument
  activeDocument = undefined
  const loadingTask = activeLoadingTask
  activeLoadingTask = undefined
  clearCanvas()

  const cleanup = pendingCleanup.then(async () => {
    await Promise.all([
      destroySilently(document),
      destroySilently(loadingTask),
    ])
  })
  pendingCleanup = cleanup
  return cleanup
}

function isCurrentRender(loadGeneration: number, sequence: number, document: PDFDocumentProxy) {
  return loadGeneration === generation && sequence === renderSequence && document === activeDocument
}

async function renderCurrentPage(renderGeneration: number) {
  const document = activeDocument
  if (!document || renderGeneration !== generation) return

  const pageNumber = currentPage.value
  const requestedZoom = zoom.value
  const sequence = ++renderSequence

  try {
    activeRenderTask?.cancel()
  } catch {
    // La tarea anterior puede haber terminado antes de la cancelación.
  }
  activeRenderTask = undefined
  loading.value = true
  error.value = ''

  try {
    const page = await document.getPage(pageNumber)
    if (!isCurrentRender(renderGeneration, sequence, document) || !canvas.value) return

    const viewport = page.getViewport({ scale: requestedZoom / 100 })
    const pixelRatio = window.devicePixelRatio || 1
    const targetCanvas = canvas.value
    targetCanvas.width = Math.floor(viewport.width * pixelRatio)
    targetCanvas.height = Math.floor(viewport.height * pixelRatio)
    targetCanvas.style.width = `${viewport.width}px`
    targetCanvas.style.height = `${viewport.height}px`

    const context = targetCanvas.getContext('2d')
    if (!context) throw new Error('No se pudo preparar el lienzo de vista previa.')

    const renderTask = page.render({
      canvasContext: context,
      viewport,
      transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
    })
    activeRenderTask = renderTask
    await renderTask.promise
    if (!isCurrentRender(renderGeneration, sequence, document) || renderTask !== activeRenderTask) return
  } catch (reason) {
    if (!isCurrentRender(renderGeneration, sequence, document) || isRenderCancellation(reason)) return
    error.value = 'No pudimos mostrar la vista previa del horario.'
  } finally {
    if (isCurrentRender(renderGeneration, sequence, document)) loading.value = false
  }
}

async function loadFile() {
  const loadGeneration = ++generation
  let documentRenderStarted = false
  renderSequence += 1
  const cleanup = disposeResources()
  resetState()
  loading.value = true

  try {
    await cleanup
    if (loadGeneration !== generation) return
    const loadingTask = await createPdfLoadingTask(props.file)
    if (loadGeneration !== generation) {
      void destroySilently(loadingTask)
      return
    }
    activeLoadingTask = loadingTask

    const document = await loadingTask.promise
    if (loadGeneration !== generation) {
      void destroySilently(document)
      return
    }
    activeDocument = document
    totalPages.value = document.numPages
    documentRenderStarted = true
    await renderCurrentPage(loadGeneration)
  } catch (reason) {
    if (loadGeneration !== generation || isRenderCancellation(reason)) return
    error.value = 'No pudimos mostrar la vista previa del horario.'
  } finally {
    if (loadGeneration === generation && !documentRenderStarted) loading.value = false
  }
}

function renderPage(page: number) {
  if (page < 1 || page > totalPages.value) return
  currentPage.value = page
  pageInput.value = String(page)
  void renderCurrentPage(generation)
}

function commitPageInput() {
  const requestedPage = Number(pageInput.value)
  if (!Number.isInteger(requestedPage) || requestedPage < 1 || requestedPage > totalPages.value) {
    pageInput.value = String(currentPage.value)
    return
  }
  renderPage(requestedPage)
}

function adjustZoom(direction: -1 | 1) {
  const currentIndex = ZOOM_LEVELS.indexOf(zoom.value)
  const nextZoom = ZOOM_LEVELS[currentIndex + direction]
  if (!nextZoom) return
  zoom.value = nextZoom
  void renderCurrentPage(generation)
}

function retry() {
  void loadFile()
}

watch(() => props.file, () => {
  void loadFile()
}, { immediate: true })

onBeforeUnmount(() => {
  generation += 1
  renderSequence += 1
  void disposeResources()
  resetState()
})
</script>

<template>
  <section class="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
    <div
      role="region"
      aria-label="Controles del PDF"
      class="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] bg-[#fbfcfa] p-3 text-[var(--color-graphite)]"
    >
      <button
        type="button"
        :disabled="!canGoPrevious"
        class="min-h-11 rounded-md border border-[var(--color-border)] px-3 font-semibold disabled:cursor-not-allowed disabled:opacity-55"
        @click="renderPage(currentPage - 1)"
      >
        Página anterior
      </button>
      <label class="flex min-h-11 items-center gap-2 font-semibold" :for="pageInputId">
        Página
        <input
          :id="pageInputId"
          v-model="pageInput"
          type="number"
          inputmode="numeric"
          min="1"
          :max="totalPages || undefined"
          class="min-h-11 w-16 rounded-md border border-[var(--color-border)] bg-white px-2 text-center"
          @keydown.enter.prevent="commitPageInput"
          @blur="commitPageInput"
        >
      </label>
      <output role="status" aria-label="Total de páginas" aria-live="polite">de {{ totalPages }}</output>
      <button
        type="button"
        :disabled="!canGoNext"
        class="min-h-11 rounded-md border border-[var(--color-border)] px-3 font-semibold disabled:cursor-not-allowed disabled:opacity-55"
        @click="renderPage(currentPage + 1)"
      >
        Página siguiente
      </button>
      <span class="mx-1 hidden h-6 border-l border-[var(--color-border)] sm:block" aria-hidden="true" />
      <button
        type="button"
        :disabled="!canZoomOut"
        class="min-h-11 rounded-md border border-[var(--color-border)] px-3 font-semibold disabled:cursor-not-allowed disabled:opacity-55"
        @click="adjustZoom(-1)"
      >
        Alejar
      </button>
      <output role="status" aria-label="Nivel de zoom" class="min-w-14 text-center font-semibold" aria-live="polite">{{ zoom }} %</output>
      <button
        type="button"
        :disabled="!canZoomIn"
        class="min-h-11 rounded-md border border-[var(--color-border)] px-3 font-semibold disabled:cursor-not-allowed disabled:opacity-55"
        @click="adjustZoom(1)"
      >
        Acercar
      </button>
    </div>

    <div v-if="error" role="alert" class="m-4 rounded-md border border-[#c97578] bg-[#fff7f6] p-4 text-[var(--color-graphite)]">
      <p class="font-semibold">{{ error }}</p>
      <button
        type="button"
        class="mt-3 min-h-11 rounded-md bg-[var(--color-brand)] px-4 font-semibold text-white hover:bg-[#6d1015]"
        @click="retry"
      >
        Reintentar vista previa
      </button>
    </div>

    <div v-else class="overflow-auto bg-[#f6f7f4] p-3" :aria-busy="loading">
      <canvas ref="canvas" role="img" :aria-label="`Página ${currentPage} del horario`" class="mx-auto block max-w-none bg-white shadow-sm" />
    </div>
  </section>
</template>
