<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AdminFilters from '@/modules/admin/components/AdminFilters.vue'
import AdminPagination from '@/modules/admin/components/AdminPagination.vue'
import AdminState from '@/modules/admin/components/AdminState.vue'
import AdminTable from '@/modules/admin/components/AdminTable.vue'
import { normalizeApiError } from '@/core/api/errors'
import { formatHomologationDate, HOMOLOGATION_LIST_PATH, homologationReturnToQuery } from '../presentation'
import { homologationsApi } from '../api/homologationsApi'
import HomologationStatusBadge from '../components/HomologationStatusBadge.vue'
import HomologationForm from '../components/HomologationForm.vue'
import HomologationDetail from '../components/HomologationDetail.vue'
import type { HomologationFilters, HomologationStatus, HomologationType, Homologation, HomologationCareerOption, SubjectOption } from '../types/homologations'

type DetailLoadResult =
  | { kind: 'loaded'; item: Homologation; warning?: string }
  | { kind: 'not-found'; status: number; message: string }
  | { kind: 'error'; status: number; message: string }
  | { kind: 'stale' }

type DetailFeedback = {
  kind: 'status' | 'alert'
  message: string
  retry?: boolean
}

const PAGE_LIMIT = 20

const route = useRoute()
const router = useRouter()
const mode = computed(() => String(route.name))
const isList = computed(() => mode.value === 'admin-homologations')
const isCreate = computed(() => mode.value === 'admin-homologation-create')
const isDetail = computed(() => mode.value === 'admin-homologation-detail')
const rows = ref<Homologation[]>([])
const pagination = ref({ page: 1, limit: PAGE_LIMIT, total: 0, totalPages: 0 })
const loading = ref(false)
const listError = ref<string | null>(null)
const filters = reactive({ search: '', estado: '' as '' | HomologationStatus, tipo: '' as '' | HomologationType, carreraId: '', materiaId: '' })
let listRequestId = 0
const careerOptions = ref<HomologationCareerOption[]>([])
const subjectOptions = ref<SubjectOption[]>([])
const careerCatalogLoading = ref(false)
const subjectCatalogLoading = ref(false)
const careerCatalogError = ref<string | null>(null)
const subjectCatalogError = ref<string | null>(null)
let careerCatalogRequestId = 0
let subjectCatalogRequestId = 0
let subjectCatalogCareerId: number | null = null
const loadedSubjectCatalogCareerId = ref<number | null>(null)
const detail = ref<Homologation | null>(null)
const detailLoading = ref(false)
const detailLoadError = ref<string | null>(null)
const detailNotFound = ref(false)
const detailActionBusy = ref(false)
const detailActionError = ref<string | null>(null)
const detailErrorTarget = ref<'grade' | 'approve' | 'reject' | null>(null)
const detailFeedback = ref<DetailFeedback | null>(null)
const detailFeedbackRegion = ref<HTMLElement | null>(null)
const detailMutationsBlocked = ref(false)
let detailRequestId = 0

function queryValue(key: string): string | undefined {
  const rawValue = route.query[key]
  const value = Array.isArray(rawValue) ? rawValue[0] : rawValue
  return typeof value === 'string' ? value : undefined
}

function positiveId(value: string | undefined): number | undefined {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function normalizedStatus(value: string | undefined): '' | HomologationStatus {
  return value === 'PENDIENTE' || value === 'APROBADA' || value === 'RECHAZADA' ? value : ''
}

function normalizedType(value: string | undefined): '' | HomologationType {
  return value === 'TOTAL' || value === 'PARCIAL' ? value : ''
}

function routePage(): number {
  const page = Number(queryValue('page'))
  return Number.isInteger(page) && page > 0 ? page : 1
}

function readFilters(): void {
  filters.search = queryValue('search') ?? ''
  filters.estado = normalizedStatus(queryValue('estado'))
  filters.tipo = normalizedType(queryValue('tipo'))
  filters.carreraId = queryValue('carreraId') ?? ''
  filters.materiaId = queryValue('materiaId') ?? ''
}

function listQuery(page = 1): Record<string, string | undefined> {
  return {
    search: filters.search.trim() || undefined,
    estado: filters.estado || undefined,
    tipo: filters.tipo || undefined,
    carreraId: positiveId(filters.carreraId) ? filters.carreraId : undefined,
    materiaId: positiveId(filters.materiaId) ? filters.materiaId : undefined,
    page: page > 1 ? String(page) : undefined,
  }
}

function filtersFromRoute(page = routePage()): HomologationFilters {
  return {
    search: filters.search.trim() || undefined,
    estado: filters.estado || undefined,
    tipo: filters.tipo || undefined,
    carreraId: positiveId(filters.carreraId),
    materiaId: positiveId(filters.materiaId),
    page,
    limit: PAGE_LIMIT,
  }
}

function errorMessage(error: unknown): string {
  return normalizeApiError(error).message
}

function routeParamValue(key: string): string | undefined {
  const value = route.params[key]
  return Array.isArray(value) ? value[0] : value
}

function lastValidPage(requestedPage: number, result: { data: Homologation[]; pagination: { totalPages: number } }): number | null {
  if (requestedPage <= 1 || result.data.length > 0) return null
  const availablePages = result.pagination.totalPages > 0 ? result.pagination.totalPages : 1
  return Math.min(requestedPage - 1, availablePages)
}

async function loadList(): Promise<void> {
  const requestId = ++listRequestId
  readFilters()
  syncFilterSubjectCatalog()
  const requestedPage = routePage()
  loading.value = true
  listError.value = null

  try {
    const result = await homologationsApi.list(filtersFromRoute(requestedPage))
    if (requestId !== listRequestId) return

    const fallbackPage = lastValidPage(requestedPage, result)
    if (fallbackPage !== null && fallbackPage !== requestedPage) {
      await router.replace({ query: listQuery(fallbackPage) })
      return
    }

    rows.value = result.data
    pagination.value = result.pagination
  } catch (error) {
    if (requestId === listRequestId) listError.value = errorMessage(error)
  } finally {
    if (requestId === listRequestId) loading.value = false
  }
}

async function loadFilterCareers(): Promise<void> {
  const requestId = ++careerCatalogRequestId
  careerCatalogLoading.value = true
  careerCatalogError.value = null
  try {
    const result = await homologationsApi.listFilterCareers()
    if (requestId !== careerCatalogRequestId || !isList.value) return
    careerOptions.value = result
  } catch (error) {
    if (requestId !== careerCatalogRequestId) return
    careerOptions.value = []
    careerCatalogError.value = errorMessage(error)
  } finally {
    if (requestId === careerCatalogRequestId) careerCatalogLoading.value = false
  }
}

function clearFilterSubjects(): void {
  subjectCatalogRequestId += 1
  subjectCatalogCareerId = null
  loadedSubjectCatalogCareerId.value = null
  subjectOptions.value = []
  subjectCatalogLoading.value = false
  subjectCatalogError.value = null
}

async function loadFilterSubjects(carreraId: number): Promise<void> {
  const requestId = ++subjectCatalogRequestId
  subjectCatalogCareerId = carreraId
  loadedSubjectCatalogCareerId.value = null
  subjectOptions.value = []
  subjectCatalogLoading.value = true
  subjectCatalogError.value = null
  try {
    const result = await homologationsApi.listFilterSubjects(carreraId)
    if (requestId !== subjectCatalogRequestId || subjectCatalogCareerId !== carreraId) return
    if (!isList.value || positiveId(filters.carreraId) !== carreraId) {
      clearFilterSubjects()
      return
    }
    subjectOptions.value = result
    loadedSubjectCatalogCareerId.value = carreraId
  } catch (error) {
    if (requestId !== subjectCatalogRequestId || subjectCatalogCareerId !== carreraId) return
    subjectOptions.value = []
    subjectCatalogError.value = errorMessage(error)
  } finally {
    if (requestId === subjectCatalogRequestId) subjectCatalogLoading.value = false
  }
}

function syncFilterSubjectCatalog(): void {
  const carreraId = positiveId(filters.carreraId)
  if (!carreraId) {
    clearFilterSubjects()
    return
  }
  if (subjectCatalogCareerId !== carreraId || (!subjectCatalogLoading.value && loadedSubjectCatalogCareerId.value !== carreraId && !subjectCatalogError.value)) {
    void loadFilterSubjects(carreraId)
  }
}

function onFilterCareerChange(): void {
  filters.materiaId = ''
  syncFilterSubjectCatalog()
}

function focusDetailFeedback(): void {
  void nextTick(() => detailFeedbackRegion.value?.focus())
}

function setDetailFeedback(feedback: DetailFeedback, focus = false): void {
  detailFeedback.value = feedback
  if (focus) focusDetailFeedback()
}

function mutationReloadFailure(operation: string, result: DetailLoadResult): void {
  detailMutationsBlocked.value = true
  const message = result.kind === 'not-found'
    ? `${operation} no pudo confirmarse porque el detalle ya no está disponible. Reintentá cargar el detalle.`
    : `${operation} no pudo confirmarse. El detalle queda en modo de consulta hasta una recarga exitosa. Reintentá cargar el detalle.`
  setDetailFeedback({
    kind: 'alert',
    message,
    retry: true,
  }, true)
}

async function loadDetail(retryConflict = true, preserveCurrent = false): Promise<DetailLoadResult> {
  const requestId = ++detailRequestId
  const id = positiveId(routeParamValue('id'))
  if (!preserveCurrent) {
    detail.value = null
    detailActionError.value = null
    detailErrorTarget.value = null
    detailFeedback.value = null
  }
  detailLoading.value = true
  if (preserveCurrent) detailMutationsBlocked.value = true
  detailLoadError.value = null
  detailNotFound.value = false

  if (!id) {
    detail.value = null
    detailMutationsBlocked.value = true
    detailNotFound.value = true
    detailLoadError.value = 'No encontramos esta homologación.'
    detailLoading.value = false
    return { kind: 'not-found', status: 404, message: detailLoadError.value }
  }

  try {
    const result = await homologationsApi.getById(id)
    if (requestId !== detailRequestId) return { kind: 'stale' }
    detail.value = result
    detailNotFound.value = false
    detailMutationsBlocked.value = false
    return { kind: 'loaded', item: result }
  } catch (error) {
    if (requestId !== detailRequestId) return { kind: 'stale' }
    const normalized = normalizeApiError(error)
    if (normalized.status === 409 && retryConflict) {
      const retried = await loadDetail(false, preserveCurrent)
      if (positiveId(routeParamValue('id')) === id) detailLoadError.value = normalized.message
      return retried.kind === 'loaded' ? { ...retried, warning: normalized.message } : retried
    }
    if (normalized.status === 404) {
      detail.value = null
      detailMutationsBlocked.value = true
      detailNotFound.value = true
      detailLoadError.value = 'No encontramos esta homologación.'
      return { kind: 'not-found', status: normalized.status, message: detailLoadError.value }
    } else {
      detailLoadError.value = normalized.message
      return { kind: 'error', status: normalized.status, message: normalized.message }
    }
  } finally {
    if (requestId === detailRequestId) detailLoading.value = false
  }
}

function applyFilters(): void {
  void router.replace({ query: listQuery(1) })
}

function changePage(page: number): void {
  if (page < 1) return
  void router.replace({ query: listQuery(page) })
}

function encodeQuery(query: Record<string, string | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, value)
  }
  return params.toString()
}

function committedListQuery(): Record<string, string | undefined> {
  const carreraId = positiveId(queryValue('carreraId'))
  const materiaId = positiveId(queryValue('materiaId'))
  const page = routePage()
  return {
    search: queryValue('search')?.trim() || undefined,
    estado: normalizedStatus(queryValue('estado')) || undefined,
    tipo: normalizedType(queryValue('tipo')) || undefined,
    carreraId: carreraId ? String(carreraId) : undefined,
    materiaId: materiaId ? String(materiaId) : undefined,
    page: page > 1 ? String(page) : undefined,
  }
}

function detailHref(item: Homologation): string {
 const returnTo = committedReturnTo()
 return `${HOMOLOGATION_LIST_PATH}/${item.id}?${new URLSearchParams({ returnTo }).toString()}`
}

function committedReturnTo(): string {
  const committedQuery = encodeQuery(committedListQuery())
  return committedQuery ? `${HOMOLOGATION_LIST_PATH}?${committedQuery}` : HOMOLOGATION_LIST_PATH
}

async function goBack(): Promise<void> {
  const query = homologationReturnToQuery(queryValue('returnTo'))
  await router.replace({
    name: 'admin-homologations',
    ...(Object.keys(query).length ? { query } : {}),
  })
}

async function retryDetail(): Promise<void> {
  setDetailFeedback({ kind: 'status', message: 'Actualizando el detalle…' })
  const result = await loadDetail(true, true)
  if (result.kind === 'loaded') {
    setDetailFeedback({ kind: 'status', message: 'Detalle actualizado.' }, true)
  } else if (result.kind !== 'stale') {
    mutationReloadFailure('La recarga no pudo completarse', result)
  }
}

function createHref(): { name: 'admin-homologation-create'; query: { returnTo: string } } {
  return { name: 'admin-homologation-create', query: { returnTo: committedReturnTo() } }
}

function typeLabel(type: HomologationType): string {
  return type === 'TOTAL' ? 'Total' : 'Parcial'
}

function gradeLabel(item: Homologation): string | number {
  return item.calificacion ?? item.notaComplementaria ?? '—'
}

async function saveComplementaryGrade(grade: number): Promise<void> {
  const current = detail.value
  if (!current || detailActionBusy.value || detailLoading.value || detailMutationsBlocked.value || current.estado !== 'PENDIENTE' || current.tipo !== 'PARCIAL') return
  detailActionBusy.value = true
  detailActionError.value = null
  detailErrorTarget.value = null
  detailFeedback.value = null
  try {
    await homologationsApi.saveComplementaryGrade(current.id, grade)
    const reloadResult = await loadDetail(true, true)
    if (reloadResult.kind !== 'loaded') {
      mutationReloadFailure('La nota complementaria', reloadResult)
      return
    }
    setDetailFeedback({ kind: 'status', message: 'Nota complementaria guardada y confirmada.' }, true)
  } catch (error) {
    const normalized = normalizeApiError(error)
    const message = normalized.message
    let reloadResult: DetailLoadResult | null = null
    if (normalized.status === 409) {
      reloadResult = await loadDetail(true, true)
    }
    if (reloadResult && reloadResult.kind !== 'loaded') {
      detailActionError.value = null
      mutationReloadFailure('La actualización de la nota se intentó', reloadResult)
      return
    }
    detailActionError.value = message
    detailErrorTarget.value = 'grade'
    setDetailFeedback({ kind: 'alert', message })
  } finally {
    detailActionBusy.value = false
    if (detailFeedback.value?.retry) focusDetailFeedback()
  }
}

async function resolveDetail(action: 'APROBAR' | 'RECHAZAR'): Promise<void> {
  const current = detail.value
  if (!current || detailActionBusy.value || detailLoading.value || detailMutationsBlocked.value || current.estado !== 'PENDIENTE') return
  detailActionBusy.value = true
  detailActionError.value = null
  detailErrorTarget.value = null
  detailFeedback.value = null
  const target = action === 'APROBAR' ? 'approve' : 'reject'
  try {
    await homologationsApi.resolve(current.id, action)
    const reloadResult = await loadDetail(true, true)
    if (reloadResult.kind !== 'loaded') {
      mutationReloadFailure(action === 'APROBAR' ? 'La aprobación' : 'El rechazo', reloadResult)
      return
    }
    const message = action === 'APROBAR' ? 'Solicitud aprobada y confirmada.' : 'Solicitud rechazada y confirmada.'
    setDetailFeedback({ kind: 'status', message }, true)
  } catch (error) {
    const normalized = normalizeApiError(error)
    const message = normalized.message
    let reloadResult: DetailLoadResult | null = null
    if (normalized.status === 409) {
      reloadResult = await loadDetail(true, true)
    }
    if (reloadResult && reloadResult.kind !== 'loaded') {
      detailActionError.value = null
      mutationReloadFailure(action === 'APROBAR' ? 'La aprobación se intentó' : 'El rechazo se intentó', reloadResult)
      return
    }
    detailActionError.value = message
    detailErrorTarget.value = target
    setDetailFeedback({ kind: 'alert', message })
  } finally {
    detailActionBusy.value = false
    if (detailFeedback.value?.retry) focusDetailFeedback()
  }
}

onMounted(() => {
  if (isList.value) {
    void loadFilterCareers()
    void loadList()
  }
  if (isDetail.value) void loadDetail()
})
watch(() => [route.name, route.params.id, route.fullPath], () => {
  if (isList.value) {
    if (!careerOptions.value.length && !careerCatalogLoading.value && !careerCatalogError.value) void loadFilterCareers()
    void loadList()
  } else {
    careerCatalogRequestId += 1
    careerOptions.value = []
    careerCatalogLoading.value = false
    careerCatalogError.value = null
    clearFilterSubjects()
  }
  if (isDetail.value) void loadDetail()
})
</script>

<template>
  <main aria-labelledby="admin-homologations-title" class="mx-auto max-w-6xl">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--color-brand)]">Administración</p>
        <h1 id="admin-homologations-title" class="mt-2 text-3xl font-semibold">Homologaciones</h1>
      </div>
      <RouterLink v-if="isList" :to="createHref()" class="min-h-11 rounded-lg bg-[var(--color-brand)] px-4 py-2.5 font-semibold text-white">Nueva homologación</RouterLink>
    </div>
    <p class="mt-2 max-w-3xl text-[var(--color-graphite)]">Registrá y resolvé homologaciones totales o parciales.</p>

    <HomologationForm v-if="isCreate" />

    <template v-else-if="isDetail">
      <div class="mt-5 flex flex-wrap items-center justify-between gap-3">
        <button type="button" class="min-h-11 rounded-lg border border-[var(--color-border)] px-4 py-2.5 font-semibold text-[var(--color-brand)]" @click="goBack">Volver a homologaciones</button>
      </div>
      <div v-if="detailFeedback" ref="detailFeedbackRegion" data-detail-feedback tabindex="-1" class="mt-5 rounded-lg border p-3 text-sm outline-none" :class="detailFeedback.kind === 'alert' ? 'border-[#edb8b8] bg-[#fff4f4] text-[#8b151b]' : 'border-[#b9d7bd] bg-[#f0f8f1] text-[#245c32]'" :role="detailFeedback.kind" :aria-live="detailFeedback.kind === 'alert' ? 'assertive' : 'polite'">
        <p>{{ detailFeedback.message }}</p>
        <button v-if="detailFeedback.retry" type="button" class="mt-3 min-h-11 rounded-lg border border-current px-4 py-2.5 font-semibold" @click="retryDetail">Reintentar carga del detalle</button>
      </div>
      <div v-if="detailLoading" class="mt-5 rounded-xl border border-[var(--color-border)] bg-white p-6 text-[var(--color-graphite)]" role="status" aria-live="polite">{{ detail ? 'Actualizando detalle…' : 'Cargando detalle…' }}</div>
      <section v-if="detailNotFound && !detail" class="mt-5 rounded-xl border border-[#edb8b8] bg-[#fff4f4] p-6" role="alert" aria-live="assertive">
        <h2 class="text-xl font-semibold">No encontramos esta homologación.</h2>
        <p class="mt-2 text-[var(--color-graphite)]">Puede haber sido eliminada o el enlace ya no ser válido.</p>
      </section>
      <template v-if="detail">
        <p v-if="detailLoadError && !detailFeedback" class="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-[#66512d]" role="alert" aria-live="polite">{{ detailLoadError }}</p>
        <HomologationDetail
          :item="detail"
          :action-busy="detailActionBusy"
          :mutations-blocked="detailLoading || detailMutationsBlocked"
          :action-error="detailActionError"
          :error-target="detailErrorTarget"
          :focus-parent-feedback="Boolean(detailFeedback)"
          @save-grade="saveComplementaryGrade"
          @approve="resolveDetail('APROBAR')"
          @reject="resolveDetail('RECHAZAR')"
        />
      </template>
      <section v-if="!detailLoading && !detailNotFound && !detail" class="mt-5 rounded-xl border border-[#edb8b8] bg-[#fff4f4] p-6" role="alert">No pudimos cargar el detalle.</section>
    </template>

    <template v-else-if="isList">
    <AdminFilters v-model:search="filters.search" aria-label="Filtros de homologaciones" search-label="Buscar" placeholder="Alumno, DNI o email" @submit="applyFilters">
      <label class="min-w-0 text-sm font-semibold">Estado<select v-model="filters.estado" class="mt-1 min-h-11 w-full rounded-lg border border-[var(--color-border)] bg-white px-3 font-normal"><option value="">Todos</option><option value="PENDIENTE">Pendiente</option><option value="APROBADA">Aprobada</option><option value="RECHAZADA">Rechazada</option></select></label>
      <label class="min-w-0 text-sm font-semibold">Tipo<select v-model="filters.tipo" class="mt-1 min-h-11 w-full rounded-lg border border-[var(--color-border)] bg-white px-3 font-normal"><option value="">Todos</option><option value="TOTAL">Total</option><option value="PARCIAL">Parcial</option></select></label>
      <label class="min-w-0 text-sm font-semibold">Carrera<select v-model="filters.carreraId" class="mt-1 min-h-11 w-full rounded-lg border border-[var(--color-border)] bg-white px-3 font-normal" :disabled="careerCatalogLoading" :aria-busy="careerCatalogLoading" @change="onFilterCareerChange"><option value="">Todas las carreras</option><option v-if="careerCatalogLoading" disabled value="">Cargando carreras…</option><option v-else-if="careerCatalogError" disabled value="">No se pudieron cargar</option><option v-for="career in careerOptions" :key="career.id" :value="String(career.id)">{{ career.nombre }}{{ career.activo ? '' : ' (histórica)' }}</option></select><button v-if="careerCatalogError" type="button" class="mt-1 text-sm font-semibold text-[var(--color-brand)] underline" @click="loadFilterCareers">Reintentar carreras</button></label>
      <label class="min-w-0 text-sm font-semibold">Materia<select v-model="filters.materiaId" class="mt-1 min-h-11 w-full rounded-lg border border-[var(--color-border)] bg-white px-3 font-normal" :disabled="!filters.carreraId || subjectCatalogLoading || loadedSubjectCatalogCareerId !== positiveId(filters.carreraId)" :aria-busy="subjectCatalogLoading"><option value="">Todas las materias</option><option v-if="subjectCatalogLoading" disabled value="">Cargando materias…</option><option v-else-if="subjectCatalogError" disabled value="">No se pudieron cargar</option><option v-for="subject in subjectOptions" :key="subject.id" :value="String(subject.id)">{{ subject.nombre }}{{ subject.activo ? '' : ' (histórica)' }}</option></select><button v-if="subjectCatalogError" type="button" class="mt-1 text-sm font-semibold text-[var(--color-brand)] underline" @click="loadFilterSubjects(positiveId(filters.carreraId) as number)">Reintentar materias</button></label>
    </AdminFilters>

    <div class="mt-5">
      <AdminState :loading="loading" :error="listError" :empty="!loading && !listError && rows.length === 0" empty-text="No hay homologaciones con esos filtros." @retry="loadList">
        <AdminTable :columns="[{ key: 'student', label: 'Alumno' }, { key: 'subject', label: 'Carrera / materia' }, { key: 'type', label: 'Tipo' }, { key: 'status', label: 'Estado' }, { key: 'grade', label: 'Nota' }, { key: 'date', label: 'Fecha' }]">
          <template #rows>
            <tr v-for="homologation in rows" :key="homologation.id" class="border-t border-[var(--color-border)] align-top">
              <td class="px-4 py-4"><strong>{{ homologation.alumno.apellidoNombre }}</strong><span class="block text-xs text-[var(--color-graphite)]">DNI {{ homologation.alumno.dni }}</span></td>
              <td class="px-4 py-4"><strong>{{ homologation.materia.carrera.nombre }}</strong><span class="block text-sm text-[var(--color-graphite)]">{{ homologation.materia.nombre }}</span></td>
              <td class="px-4 py-4">{{ typeLabel(homologation.tipo) }}</td>
              <td class="px-4 py-4"><HomologationStatusBadge :item="homologation" /></td>
              <td class="px-4 py-4">{{ gradeLabel(homologation) }}</td>
              <td class="px-4 py-4">{{ formatHomologationDate(homologation.fecha) }}</td>
              <td class="px-4 py-4 text-right"><a :href="detailHref(homologation)" class="font-semibold text-[var(--color-brand)] hover:underline">Ver detalle<span class="sr-only"> de {{ homologation.alumno.apellidoNombre }}</span></a></td>
            </tr>
          </template>
          <template #cards>
            <article v-for="homologation in rows" :key="homologation.id" class="rounded-lg border border-[var(--color-border)] p-4">
              <h2 class="font-semibold">{{ homologation.alumno.apellidoNombre }}</h2>
              <p class="mt-1 text-sm text-[var(--color-graphite)]">DNI {{ homologation.alumno.dni }}</p>
              <dl class="mt-3 grid gap-2 text-sm">
                <div><dt class="font-semibold">Carrera / materia</dt><dd>{{ homologation.materia.carrera.nombre }} · {{ homologation.materia.nombre }}</dd></div>
                <div><dt class="font-semibold">Tipo</dt><dd>{{ typeLabel(homologation.tipo) }}</dd></div>
                <div><dt class="font-semibold">Estado</dt><dd><HomologationStatusBadge :item="homologation" /></dd></div>
                <div><dt class="font-semibold">Nota</dt><dd>{{ gradeLabel(homologation) }}</dd></div>
                <div><dt class="font-semibold">Fecha</dt><dd>{{ formatHomologationDate(homologation.fecha) }}</dd></div>
              </dl>
              <a :href="detailHref(homologation)" class="mt-4 inline-flex min-h-11 items-center font-semibold text-[var(--color-brand)]">Ver detalle<span class="sr-only"> de {{ homologation.alumno.apellidoNombre }}</span></a>
            </article>
          </template>
        </AdminTable>
        <AdminPagination :pagination="pagination" @change="changePage" />
      </AdminState>
    </div>
    </template>
  </main>
</template>
