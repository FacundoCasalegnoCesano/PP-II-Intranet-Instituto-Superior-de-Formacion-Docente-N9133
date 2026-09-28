<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Download, ExternalLink, FileText, History, Upload } from 'lucide-vue-next'
import { schedulesApi } from '../api/schedulesApi'
import type { PublishedSchedule, ScheduleCareer, ScheduleOptions } from '../types/schedules'
import SchedulePdfViewer from '../components/SchedulePdfViewer.vue'
import { normalizeApiError } from '@/core/api/errors'
import { useAuthStore } from '@/stores/authStore'
import AppButton from '@/ui/AppButton.vue'
import ConfirmDialog from '@/ui/ConfirmDialog.vue'

const auth = useAuthStore()
const years = ref<number[]>([])
const selectedYear = ref<number | null>(null)
const options = ref<ScheduleOptions>({ carreras: [], generalDisponible: false })
const selectedCareerId = ref<number | null>(null)
const selectedCourseYear = ref<number | null>(null)
const current = ref<PublishedSchedule | null>(null)
const history = ref<PublishedSchedule[]>([])
const loading = ref(true)
const loadingDocument = ref(false)
const error = ref('')
const documentError = ref('')
const blobUrl = ref<string | null>(null)
const documentBlob = ref<Blob | null>(null)
const selectedFile = ref<File | null>(null)
const uploadCycle = ref(new Date().getFullYear())
const uploadCareerId = ref<number | null>(null)
const uploadCourseYear = ref<number | null>(null)
const uploadTitle = ref('')
const pendingAction = ref<{ kind: 'publish' } | { kind: 'restore'; document: PublishedSchedule } | null>(null)
const saving = ref(false)
const actionError = ref('')
let requestGeneration = 0
let documentGeneration = 0

const isAdmin = computed(() => auth.activeRole === 'ADMINISTRATIVO')
const safeFileName = computed(() => {
  const base = (current.value?.titulo || `horario-${current.value?.cicloLectivo ?? 'publicado'}`)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  return `${base || 'horario-publicado'}.pdf`
})
const actionTitle = computed(() => pendingAction.value?.kind === 'restore' ? 'Volver a publicar versión' : 'Reemplazar horario publicado')
const actionDescription = computed(() => pendingAction.value?.kind === 'restore'
  ? `Esta versión quedará vigente para ${scopeLabel(pendingAction.value.document)}.`
  : `El nuevo PDF reemplazará la publicación vigente para ${uploadScopeLabel()}.`)
const selectedCareer = computed(() => options.value.carreras.find(career => career.id === selectedCareerId.value) ?? null)
const uploadCareer = computed(() => options.value.carreras.find(career => career.id === uploadCareerId.value) ?? null)
const selectedCourseYears = computed(() => yearsForCareer(selectedCareer.value))
const uploadCourseYears = computed(() => yearsForCareer(uploadCareer.value))
const hasSpecificSelection = computed(() => selectedCareerId.value !== null && selectedCourseYear.value !== null)
const hasUploadSelection = computed(() => uploadCareerId.value !== null && uploadCourseYear.value !== null)
const hasScheduleAvailability = computed(() => options.value.generalDisponible || options.value.carreras.length > 0)

function yearsForCareer(career: ScheduleCareer | null): number[] {
  return career ? Array.from({ length: career.duracionAnios }, (_, index) => index + 1) : []
}

function scopeLabel(schedule: PublishedSchedule): string {
  return schedule.carrera && schedule.cursoAnio ? `${schedule.carrera.nombre}, ${schedule.cursoAnio}.° año del ciclo ${schedule.cicloLectivo}` : `el horario general del ciclo ${schedule.cicloLectivo}`
}

function uploadScopeLabel(): string {
  return uploadCareer.value && uploadCourseYear.value ? `${uploadCareer.value.nombre}, ${uploadCourseYear.value}.° año del ciclo ${uploadCycle.value}` : `el ciclo ${uploadCycle.value}`
}

function clearDocumentResources(): void {
  if (blobUrl.value) URL.revokeObjectURL(blobUrl.value)
  blobUrl.value = null
  documentBlob.value = null
}

function nextRequestGeneration(): number {
  requestGeneration += 1
  documentGeneration += 1
  return requestGeneration
}

function isCurrentRequest(generation: number): boolean {
  return generation === requestGeneration
}

async function loadDocument(schedule: PublishedSchedule, generation: number): Promise<void> {
  if (!isCurrentRequest(generation)) return
  const generationDocument = ++documentGeneration
  loadingDocument.value = true
  try {
    const file = await schedulesApi.download(schedule.id)
    if (!isCurrentRequest(generation) || generationDocument !== documentGeneration) return
    const nextBlobUrl = URL.createObjectURL(file)
    if (!isCurrentRequest(generation) || generationDocument !== documentGeneration) {
      URL.revokeObjectURL(nextBlobUrl)
      return
    }
    clearDocumentResources()
    documentBlob.value = file
    blobUrl.value = nextBlobUrl
  } catch {
    if (isCurrentRequest(generation) && generationDocument === documentGeneration) documentError.value = 'No pudimos descargar el PDF publicado.'
  } finally {
    if (isCurrentRequest(generation) && generationDocument === documentGeneration) loadingDocument.value = false
  }
}

async function loadHistory(cicloLectivo: number, generation: number): Promise<void> {
  if (!isAdmin.value || !isCurrentRequest(generation)) return
  try {
    const filters = hasSpecificSelection.value
      ? { cicloLectivo, carreraId: selectedCareerId.value!, cursoAnio: selectedCourseYear.value! }
      : { cicloLectivo }
    const versions = await schedulesApi.listHistory(filters)
    if (isCurrentRequest(generation)) history.value = versions
  } catch {
    if (isCurrentRequest(generation)) history.value = []
  }
}

async function loadSchedule(generation = nextRequestGeneration()): Promise<void> {
  if (selectedYear.value === null) return
  const cicloLectivo = selectedYear.value
  current.value = null
  history.value = []
  error.value = ''
  documentError.value = ''
  actionError.value = ''
  clearDocumentResources()
  loadingDocument.value = true
  try {
    const schedule = await schedulesApi.getCurrent({ cicloLectivo, ...(hasSpecificSelection.value ? { carreraId: selectedCareerId.value!, cursoAnio: selectedCourseYear.value! } : {}) })
    if (!isCurrentRequest(generation)) return
    current.value = schedule
    uploadCycle.value = schedule.cicloLectivo
    void loadDocument(schedule, generation)
    void loadHistory(cicloLectivo, generation)
  } catch (loadError) {
    if (isCurrentRequest(generation)) {
      const status = normalizeApiError(loadError).status
      error.value = status === 404 ? '' : 'No pudimos cargar el horario para el ciclo lectivo seleccionado.'
      loadingDocument.value = false
    }
  }
}

async function load(): Promise<void> {
  const generation = nextRequestGeneration()
  loading.value = true
  error.value = ''
  current.value = null
  history.value = []
  clearDocumentResources()
  try {
    const listedYears = await schedulesApi.listYears()
    if (!isCurrentRequest(generation)) return
    years.value = listedYears
    const currentCycle = new Date().getFullYear()
    years.value = [...new Set([currentCycle, ...years.value])].sort((a, b) => b - a)
    selectedYear.value = years.value[0] ?? currentCycle
    uploadCycle.value = selectedYear.value
    await loadOptions(generation)
    if (!isCurrentRequest(generation)) return
  } catch {
    if (isCurrentRequest(generation)) error.value = 'No pudimos cargar los horarios publicados.'
  } finally {
    if (isCurrentRequest(generation)) loading.value = false
  }
}

async function loadOptions(parentGeneration?: number): Promise<void> {
  if (selectedYear.value === null) return
  const generation = parentGeneration ?? nextRequestGeneration()
  loading.value = true
  error.value = ''
  current.value = null
  history.value = []
  clearDocumentResources()
  try {
    let result: ScheduleOptions
    try {
      result = await schedulesApi.listOptions(selectedYear.value)
    } catch {
      if (isCurrentRequest(generation)) error.value = 'No pudimos cargar las carreras disponibles para el ciclo seleccionado.'
      return
    }
    if (!isCurrentRequest(generation)) return
    options.value = result
    if (!options.value.carreras.some(career => career.id === selectedCareerId.value)) selectedCareerId.value = options.value.carreras[0]?.id ?? null
    if (!selectedCareerId.value) selectedCourseYear.value = null
    else if (!yearsForCareer(selectedCareer.value).includes(selectedCourseYear.value ?? 0)) selectedCourseYear.value = 1
    if (!options.value.carreras.some(career => career.id === uploadCareerId.value)) uploadCareerId.value = null
    if (!uploadCareerId.value) uploadCourseYear.value = null
    else if (!yearsForCareer(uploadCareer.value).includes(uploadCourseYear.value ?? 0)) uploadCourseYear.value = 1
    if (!hasSpecificSelection.value && !options.value.generalDisponible) {
      current.value = null
      history.value = []
      clearDocumentResources()
      return
    }
    await loadSchedule(generation)
  } finally {
    if (isCurrentRequest(generation)) loading.value = false
  }
}

async function changeYear(): Promise<void> {
  selectedCareerId.value = null
  selectedCourseYear.value = null
  await loadOptions()
}

async function changeCareer(): Promise<void> {
  selectedCourseYear.value = selectedCareerId.value === null ? null : 1
  await loadSchedule()
}

watch(() => [auth.activeRole, auth.user?.idUsuario], () => {
  nextRequestGeneration()
  years.value = []
  options.value = { carreras: [], generalDisponible: false }
  selectedYear.value = null
  selectedCareerId.value = null
  selectedCourseYear.value = null
  uploadCareerId.value = null
  uploadCourseYear.value = null
  selectedFile.value = null
  uploadTitle.value = ''
  actionError.value = ''
  saving.value = false
  current.value = null
  history.value = []
  pendingAction.value = null
  clearDocumentResources()
  void load()
})

async function changeCourseYear(): Promise<void> {
  await loadSchedule()
}

function retryDocument(): void {
  if (!current.value) return
  documentError.value = ''
  void loadDocument(current.value, requestGeneration)
}

function preparePublish(): void {
  actionError.value = ''
  if (!selectedFile.value) {
    actionError.value = 'Seleccioná un archivo PDF para publicar.'
    return
  }
  if (!hasUploadSelection.value) {
    actionError.value = 'Seleccioná una carrera y un año de cursado.'
    return
  }
  pendingAction.value = { kind: 'publish' }
}

function prepareRestore(document: PublishedSchedule): void {
  actionError.value = ''
  pendingAction.value = { kind: 'restore', document }
}

function actionFailure(error: unknown, fallback: string): string {
  const normalized = normalizeApiError(error)
  return normalized.status >= 400 && normalized.status < 500 && normalized.message
    ? normalized.message
    : fallback
}

async function confirmAction(): Promise<void> {
  const action = pendingAction.value
  if (!action || saving.value) return
  const snapshot = {
    action,
    uploadCycle: uploadCycle.value,
    uploadCareerId: uploadCareerId.value,
    uploadCourseYear: uploadCourseYear.value,
    uploadTitle: uploadTitle.value,
    file: selectedFile.value,
  }
  saving.value = true
  actionError.value = ''
  const generation = nextRequestGeneration()
  try {
    let published: PublishedSchedule
    if (snapshot.action.kind === 'publish') {
      const result = await schedulesApi.publish({ archivo: snapshot.file!, cicloLectivo: snapshot.uploadCycle, carreraId: snapshot.uploadCareerId!, cursoAnio: snapshot.uploadCourseYear!, titulo: snapshot.uploadTitle })
      published = result.documento
    } else {
      published = await schedulesApi.restore(snapshot.action.document.id)
    }
    if (!isCurrentRequest(generation)) return
    if (snapshot.action.kind === 'publish') {
      selectedFile.value = null
      uploadTitle.value = ''
    }
    current.value = published
    documentError.value = ''
    selectedYear.value = published.cicloLectivo
    selectedCareerId.value = published.carreraId
    selectedCourseYear.value = published.cursoAnio
    uploadCareerId.value = published.carreraId
    uploadCourseYear.value = published.cursoAnio
    if (!years.value.includes(published.cicloLectivo)) years.value = [published.cicloLectivo, ...years.value].sort((a, b) => b - a)
    void loadDocument(published, generation)
    void loadHistory(published.cicloLectivo, generation)
    pendingAction.value = null
  } catch (error) {
    if (!isCurrentRequest(generation)) return
    actionError.value = snapshot.action.kind === 'publish'
      ? actionFailure(error, 'No se pudo publicar el horario.')
      : actionFailure(error, 'No se pudo restaurar esta versión.')
  } finally {
    if (isCurrentRequest(generation)) saving.value = false
  }
}

onMounted(() => { void load() })
onBeforeUnmount(() => {
  nextRequestGeneration()
  clearDocumentResources()
})
</script>

<template>
  <main class="mx-auto max-w-6xl" aria-labelledby="schedules-title">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--color-brand)]">Comunidad institucional</p>
        <h1 id="schedules-title" class="mt-2 text-3xl font-semibold text-[var(--color-text)]">Horarios publicados</h1>
        <p class="mt-2 max-w-2xl text-[var(--color-graphite)]">Consultá el horario oficial vigente de cada ciclo lectivo.</p>
      </div>
      <label v-if="years.length || isAdmin" class="grid min-w-0 max-w-full gap-1 text-sm font-semibold text-[var(--color-text)]">Ciclo lectivo
        <select v-model.number="selectedYear" :disabled="saving" class="min-h-11 min-w-0 max-w-full rounded-md border border-[var(--color-border)] bg-white px-3 font-normal" @change="changeYear">
          <option v-for="year in years" :key="year" :value="year">{{ year }}</option>
          <option v-if="selectedYear && !years.includes(selectedYear)" :value="selectedYear">{{ selectedYear }}</option>
        </select>
      </label>
      <label v-if="options.carreras.length" class="grid min-w-0 max-w-full gap-1 text-sm font-semibold text-[var(--color-text)]">Carrera
        <select v-model.number="selectedCareerId" :disabled="loading || saving" class="min-h-11 w-full min-w-0 max-w-full rounded-md border border-[var(--color-border)] bg-white px-3 font-normal" @change="changeCareer">
          <option v-if="options.generalDisponible" :value="null">Horario general</option>
          <option v-for="career in options.carreras" :key="career.id" :value="career.id">{{ career.nombre }}</option>
        </select>
      </label>
      <label v-if="selectedCareer" class="grid min-w-0 max-w-full gap-1 text-sm font-semibold text-[var(--color-text)]">Año de cursado
        <select v-model.number="selectedCourseYear" :disabled="loading || saving" class="min-h-11 min-w-0 max-w-full rounded-md border border-[var(--color-border)] bg-white px-3 font-normal" @change="changeCourseYear">
          <option v-for="year in selectedCourseYears" :key="year" :value="year">{{ year }}.° año</option>
        </select>
      </label>
    </div>

    <section v-if="loading" class="mt-7 rounded-xl border border-[var(--color-border)] bg-white p-6" aria-live="polite">Cargando horarios publicados…</section>
    <section v-else-if="error && !isAdmin" class="mt-7 rounded-xl border border-[#a31118]/30 bg-[#fff7f6] p-6" role="alert">
      <p>{{ error }}</p><AppButton class="mt-4" variant="secondary" @click="load">Reintentar</AppButton>
    </section>
    <section v-else-if="!hasScheduleAvailability && !isAdmin" class="mt-7 rounded-xl border border-[var(--color-border)] bg-white p-6">
      Todavía no hay horarios publicados.
      <AppButton class="mt-4" variant="secondary" @click="load">Reintentar</AppButton>
    </section>
    <template v-else>
      <section v-if="error" class="mt-7 rounded-xl border border-[#a31118]/30 bg-[#fff7f6] p-6" role="alert">
        <p>{{ error }}</p><AppButton class="mt-4" variant="secondary" @click="load">Reintentar</AppButton>
      </section>
      <section v-else-if="!hasScheduleAvailability" class="mt-7 rounded-xl border border-[var(--color-border)] bg-white p-6">
        Todavía no hay horarios publicados.
        <AppButton class="mt-4" variant="secondary" @click="load">Reintentar</AppButton>
      </section>
      <section v-else-if="current" class="mt-7 rounded-xl border border-[var(--color-border)] bg-white p-5 sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div><h2 class="text-2xl font-semibold">{{ current.titulo }}</h2><p class="mt-1 text-sm text-[var(--color-graphite)]">Ciclo {{ current.cicloLectivo }} · Publicado el {{ new Date(current.fechaPublicacion).toLocaleDateString('es-AR') }}{{ current.publicadoPor ? ` por ${current.publicadoPor.nombre}` : '' }}</p></div>
          <p class="rounded-full bg-[#f6f7f4] px-3 py-1 text-sm font-semibold">{{ Math.max(1, Math.round(current.tamanio / 1024)) }} KB</p>
        </div>
        <div class="mt-5 flex flex-wrap gap-3">
          <a :href="blobUrl ?? undefined" target="_blank" rel="noopener" :aria-disabled="!blobUrl" class="inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--color-brand)] px-4 py-2.5 font-semibold text-white" :class="!blobUrl && 'pointer-events-none opacity-55'"><ExternalLink class="size-4" />Abrir PDF</a>
          <a :href="blobUrl ?? undefined" :download="safeFileName" :aria-disabled="!blobUrl" class="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--color-brand)] px-4 py-2.5 font-semibold text-[var(--color-brand)]" :class="!blobUrl && 'pointer-events-none opacity-55'"><Download class="size-4" />Descargar PDF</a>
        </div>
        <section v-if="documentError" class="mt-4 rounded-md border border-[#a31118]/30 bg-[#fff7f6] p-4" role="alert">
          <p>{{ documentError }}</p>
          <AppButton class="mt-3" variant="secondary" @click="retryDocument">Reintentar PDF</AppButton>
        </section>
        <div class="mt-5 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[#f6f7f4]">
          <SchedulePdfViewer v-if="documentBlob" :file="documentBlob" />
          <p v-else class="p-5" aria-live="polite">{{ loadingDocument ? 'Preparando la vista previa del PDF…' : 'La vista previa no está disponible.' }}</p>
        </div>
        <p class="mt-3 text-sm text-[var(--color-graphite)] md:hidden">En dispositivos móviles, abrí o descargá el PDF para una lectura más cómoda.</p>
      </section>
      <section v-else-if="years.length" class="mt-7 rounded-xl border border-[var(--color-border)] bg-white p-6">No hay un horario vigente para este ciclo lectivo.</section>

      <section v-if="isAdmin" class="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,.8fr)]">
        <form class="min-w-0 rounded-xl border border-[var(--color-border)] bg-white p-5 sm:p-6" @submit.prevent="preparePublish">
          <div class="flex items-center gap-2"><Upload class="size-5 text-[var(--color-brand)]" /><h2 class="text-xl font-semibold">Publicar horario</h2></div>
          <p class="mt-2 text-sm text-[var(--color-graphite)]">El nuevo PDF se publicará al confirmar el reemplazo.</p>
          <fieldset :disabled="saving" class="mt-5 grid min-w-0 gap-4 sm:grid-cols-2">
            <label class="min-w-0 text-sm font-semibold">Ciclo lectivo
              <input v-model.number="uploadCycle" type="number" min="2000" max="2100" required class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] px-3 font-normal" @change="selectedYear = uploadCycle; void loadOptions()" />
            </label>
            <label class="min-w-0 text-sm font-semibold">Carrera
              <select v-model.number="uploadCareerId" class="mt-1 min-h-11 w-full min-w-0 max-w-full rounded-md border border-[var(--color-border)] px-3 font-normal" @change="uploadCourseYear = uploadCareerId === null ? null : 1">
                <option :value="null">Seleccionar carrera</option>
                <option v-for="career in options.carreras" :key="career.id" :value="career.id">{{ career.nombre }}</option>
              </select>
            </label>
            <label v-if="uploadCareer" class="min-w-0 text-sm font-semibold">Año de cursado
              <select v-model.number="uploadCourseYear" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-3 font-normal">
                <option v-for="year in uploadCourseYears" :key="year" :value="year">{{ year }}.° año</option>
              </select>
            </label>
            <label class="min-w-0 text-sm font-semibold">Título
              <input v-model="uploadTitle" maxlength="160" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] px-3 font-normal" />
            </label>
            <label class="min-w-0 text-sm font-semibold sm:col-span-2">Archivo PDF
              <input type="file" accept="application/pdf,.pdf" required class="mt-1 block w-full text-sm font-normal" @change="selectedFile = (($event.target as HTMLInputElement).files?.[0] ?? null)" />
            </label>
          </fieldset>
          <p v-if="selectedFile" class="mt-4 rounded-md bg-[#f6f7f4] p-3 text-sm"><FileText class="mr-1 inline size-4" />{{ selectedFile.name }} · {{ Math.max(1, Math.round(selectedFile.size / 1024)) }} KB</p>
          <p v-if="actionError" class="mt-4 text-sm text-[#a31118]" role="alert">{{ actionError }}</p>
          <AppButton class="mt-5" type="submit">Publicar horario</AppButton>
        </form>
        <section class="rounded-xl border border-[var(--color-border)] bg-white p-5 sm:p-6" aria-labelledby="history-title"><div class="flex items-center gap-2"><History class="size-5 text-[var(--color-brand)]" /><h2 id="history-title" class="text-xl font-semibold">Historial</h2></div><p v-if="!history.length" class="mt-4 text-sm text-[var(--color-graphite)]">No hay versiones anteriores para mostrar.</p><ul v-else class="mt-4 grid gap-3"><li v-for="version in history" :key="version.id" class="rounded-md border border-[var(--color-border)] p-3"><p class="font-semibold">{{ version.titulo }}</p><p class="text-sm text-[var(--color-graphite)]">{{ new Date(version.fechaPublicacion).toLocaleDateString('es-AR') }} · {{ Math.max(1, Math.round(version.tamanio / 1024)) }} KB</p><p class="mt-1 text-sm text-[var(--color-graphite)]">Publicado por: {{ version.publicadoPor?.nombre ?? 'Sin dato de publicación' }}</p><AppButton v-if="!version.vigente" class="mt-3" variant="secondary" @click="prepareRestore(version)">Volver a publicar</AppButton><span v-else class="mt-3 inline-block text-sm font-semibold text-[var(--color-brand)]">Vigente</span></li></ul></section>
      </section>
    </template>
    <ConfirmDialog :open="Boolean(pendingAction)" :title="actionTitle" :description="actionDescription" :confirm-label="pendingAction?.kind === 'restore' ? 'Volver a publicar' : 'Publicar horario'" :loading="saving" @cancel="pendingAction = null" @confirm="confirmAction" />
  </main>
</template>
