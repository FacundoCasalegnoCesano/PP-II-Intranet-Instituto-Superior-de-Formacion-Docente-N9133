<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AdminExamsList from '../components/ExamTableList.vue'
import ExamResultPanel from '../components/ExamResultPanel.vue'
import ExamTribunalEditor from '../components/ExamTribunalEditor.vue'
import {
  assignTribunalMember,
  closeExamTable,
  createExamTable,
  enrollStudent,
  getExamTable,
  getExamWorkspace,
  listCareerOptions,
  listSubjectOptions,
  listTeacherOptions,
  listExamTables,
  reloadExamResults,
  removeTribunalMember,
  reopenExamTable,
  saveExamResult,
  updateExamTable,
  withdrawStudent,
} from '../api/examsApi'
import { academicLabel } from '@/core/presentation/academicLabels'
import { useFeedback } from '@/ui/feedback'
import { examDateInputValue, examDateLabel, toInstitutionalIso } from '../presentation'
import { isTribunalComplete } from '../tribunalRules'
import type {
  CareerOption,
  ExamFilters,
  ExamFormValues,
  ExamListItem,
  ExamResultsSnapshot,
  ExamTableStatus,
  ExamWorkspace,
  ResultWriteInput,
  SubjectOption,
  TeacherOption,
  TribunalMember,
  TribunalRole,
} from '../types/exams'

const route = useRoute()
const router = useRouter()
const feedback = useFeedback()
const mode = computed(() => String(route.name ?? 'admin-exams'))
const isList = computed(() => mode.value === 'admin-exams')
const isCreate = computed(() => mode.value === 'admin-exam-new')
const isDetail = computed(() => mode.value === 'admin-exam-detail')
const isEdit = computed(() => mode.value === 'admin-exam-edit')
const examId = computed(() => Number(route.params.id))

const exams = ref<ExamListItem[]>([])
const workspace = ref<ExamWorkspace | null>(null)
const subjects = ref<SubjectOption[]>([])
const careers = ref<CareerOption[]>([])
const teachers = ref<TeacherOption[]>([])
const pagination = ref({ page: 1, limit: 20, total: 0, totalPages: 0 })
const loading = ref(false)
const error = ref('')
const optionsError = ref('')
const saving = ref(false)
const requestId = ref(0)
const fieldError = ref('')
const enrollmentError = ref('')
const studentId = ref('')
const studentCondition = ref<'REGULAR' | 'LIBRE'>('REGULAR')
const formReady = ref(false)
const formVersion = ref<number | null>(null)

const filters = reactive({ materiaId: '', carreraId: '', cicloLectivo: '', fechaDesde: '', fechaHasta: '', estadoMesa: '' as '' | ExamTableStatus })
const form = reactive<ExamFormValues>({ materiaId: 0, fecha: '', tipoExamen: 'ORAL', llamado: 1, folioExamen: '', libroExamen: '' })

function currentQuery(page?: number): Record<string, string | undefined> {
  return {
    materiaId: filters.materiaId || undefined,
    carreraId: filters.carreraId || undefined,
    cicloLectivo: filters.cicloLectivo || undefined,
    fechaDesde: filters.fechaDesde || undefined,
    fechaHasta: filters.fechaHasta || undefined,
    estadoMesa: filters.estadoMesa || undefined,
    page: page && page > 1 ? String(page) : undefined,
  }
}

function readFilters(): void {
  filters.materiaId = String(route.query.materiaId ?? '')
  filters.carreraId = String(route.query.carreraId ?? '')
  filters.cicloLectivo = String(route.query.cicloLectivo ?? '')
  filters.fechaDesde = String(route.query.fechaDesde ?? '')
  filters.fechaHasta = String(route.query.fechaHasta ?? '')
  filters.estadoMesa = (String(route.query.estadoMesa ?? '') as typeof filters.estadoMesa)
}

function parsedFilters(): ExamFilters {
  return {
    materiaId: filters.materiaId ? Number(filters.materiaId) : undefined,
    carreraId: filters.carreraId ? Number(filters.carreraId) : undefined,
    cicloLectivo: filters.cicloLectivo ? Number(filters.cicloLectivo) : undefined,
    fechaDesde: filters.fechaDesde || undefined,
    fechaHasta: filters.fechaHasta || undefined,
    estadoMesa: filters.estadoMesa || undefined,
    page: Number(route.query.page ?? 1),
    limit: 20,
  }
}

function errorStatus(cause: unknown): number | undefined {
  return cause && typeof cause === 'object' && 'status' in cause ? (cause as { status?: number }).status : undefined
}

function isConflict(cause: unknown): boolean { return errorStatus(cause) === 409 }

async function loadList(): Promise<void> {
  const current = ++requestId.value
  loading.value = true
  error.value = ''
  readFilters()
  try {
    const result = await listExamTables(parsedFilters())
    if (current !== requestId.value) return
    exams.value = result.data
    pagination.value = result.pagination
  } catch {
    if (current === requestId.value) error.value = 'No pudimos cargar las mesas de examen.'
  } finally {
    if (current === requestId.value) loading.value = false
  }
}

async function loadWorkspace(): Promise<void> {
  const current = ++requestId.value
  loading.value = true
  error.value = ''
  try {
    const result = await getExamWorkspace(examId.value)
    if (current === requestId.value) workspace.value = result
  } catch (cause) {
    if (current === requestId.value) {
      error.value = errorStatus(cause) === 403
        ? 'No tenés permiso para consultar esta mesa.'
        : errorStatus(cause) === 404
          ? 'La mesa no existe o ya no está disponible.'
          : 'No pudimos cargar el detalle de la mesa.'
    }
  } finally {
    if (current === requestId.value) loading.value = false
  }
}

async function loadOptions(): Promise<void> {
  optionsError.value = ''
  try {
    const [subjectResult, careerResult, teacherResult] = await Promise.all([listSubjectOptions(), listCareerOptions(), listTeacherOptions()])
    subjects.value = subjectResult.data
    careers.value = careerResult.data
    teachers.value = teacherResult.data
  } catch {
    optionsError.value = 'No pudimos cargar las opciones de materia, carrera y docentes.'
  }
}

async function loadForm(): Promise<void> {
  fieldError.value = ''
  formReady.value = false
  if (!isEdit.value) {
    await loadOptions()
    formReady.value = true
    return
  }
  try {
    const detail = await getExamTable(examId.value)
    formVersion.value = detail.version
    if (detail.estadoMesa === 'FINALIZADA') {
      await router.replace({ name: 'admin-exam-detail', params: { id: examId.value }, query: route.query })
      return
    }
    Object.assign(form, { materiaId: detail.materia.id, fecha: examDateInputValue(detail.fecha), tipoExamen: detail.tipoExamen, llamado: detail.llamado, folioExamen: detail.folioExamen ?? '', libroExamen: detail.libroExamen ?? '' })
    await loadOptions()
    formReady.value = true
  } catch (cause) {
    fieldError.value = errorStatus(cause) === 403
      ? 'No tenés permiso para editar esta mesa.'
      : errorStatus(cause) === 404
        ? 'La mesa no existe o ya no está disponible.'
        : 'No pudimos cargar la mesa para editarla.'
  }
}

function applyFilters(): void {
  void router.replace({ name: 'admin-exams', query: currentQuery() })
}

function changePage(page: number): void {
  void router.replace({ name: 'admin-exams', query: currentQuery(page) })
}

function resetFilters(): void {
  Object.assign(filters, { materiaId: '', carreraId: '', cicloLectivo: '', fechaDesde: '', fechaHasta: '', estadoMesa: '' })
  applyFilters()
}

function tribunalComplete(members: TribunalMember[]): boolean { return isTribunalComplete(members) }

async function saveForm(): Promise<void> {
  fieldError.value = ''
  if (isEdit.value && !formReady.value) return
  if (!form.fecha || (!isEdit.value && !form.materiaId)) {
    fieldError.value = 'Completá la materia y la fecha de la mesa.'
    return
  }
  if (form.llamado < 1 || form.llamado > 3) {
    fieldError.value = 'El llamado debe estar entre 1 y 3.'
    return
  }
  saving.value = true
  try {
    if (isCreate.value) {
      await createExamTable({ ...form, fecha: toInstitutionalIso(form.fecha) })
      feedback.success('Mesa creada.')
      await router.replace({ name: 'admin-exams' })
    } else {
      const version = formVersion.value ?? workspace.value?.detail.version ?? (await getExamTable(examId.value)).version
      await updateExamTable(examId.value, { fecha: toInstitutionalIso(form.fecha), tipoExamen: form.tipoExamen, llamado: form.llamado, folioExamen: form.folioExamen, libroExamen: form.libroExamen, expectedVersion: version })
      feedback.success('Mesa actualizada.')
      await router.replace({ name: 'admin-exam-detail', params: { id: examId.value }, query: route.query })
    }
  } catch (cause) {
    if (isConflict(cause)) {
      fieldError.value = 'Otra persona modificó la configuración. Recargamos la versión actual; tus campos siguen intactos. Podés reintentar.'
      try {
        const fresh = await getExamTable(examId.value)
        formVersion.value = fresh.version
        if (fresh.estadoMesa === 'FINALIZADA') {
          await router.replace({ name: 'admin-exam-detail', params: { id: examId.value }, query: route.query })
        }
      } catch {
        fieldError.value = 'No pudimos recargar la configuración actual. Conservamos tus campos para reintentar.'
      }
    } else {
      fieldError.value = 'No se pudo guardar la mesa. Verificá la versión actual y los datos.'
    }
  } finally {
    saving.value = false
  }
}

async function addTribunal(payload: { profesorId: number; rolTribunal: TribunalRole }): Promise<void> {
  if (!workspace.value) return
  enrollmentError.value = ''
  saving.value = true
  try {
    await assignTribunalMember(examId.value, payload.profesorId, payload.rolTribunal, workspace.value.detail.version)
    await loadWorkspace()
  } catch (cause) {
    if (isConflict(cause)) {
      enrollmentError.value = 'Otra persona modificó el tribunal. Recargamos la versión actual; podés reintentar.'
      await loadWorkspace()
    } else {
      feedback.error('No se pudo agregar el integrante al tribunal.')
    }
  } finally {
    saving.value = false
  }
}

async function removeTribunal(member: TribunalMember): Promise<void> {
  if (!workspace.value || !member.id || !window.confirm(`¿Quitar a ${member.apellidoNombre} del tribunal?`)) return
  enrollmentError.value = ''
  saving.value = true
  try {
    await removeTribunalMember(member.id, workspace.value.detail.version)
    await loadWorkspace()
  } catch (cause) {
    if (isConflict(cause)) {
      enrollmentError.value = 'Otra persona modificó el tribunal. Recargamos la versión actual; podés reintentar.'
      await loadWorkspace()
    } else {
      feedback.error('No se pudo quitar el integrante del tribunal.')
    }
  } finally {
    saving.value = false
  }
}

async function addEnrollment(): Promise<void> {
  if (!workspace.value || !Number(studentId.value)) { enrollmentError.value = 'Indicá el ID de cuenta del alumno.'; return }
  enrollmentError.value = ''
  saving.value = true
  try {
    await enrollStudent(examId.value, Number(studentId.value), studentCondition.value, workspace.value.detail.version)
    studentId.value = ''
    await loadWorkspace()
  } catch (cause) {
    if (isConflict(cause)) {
      enrollmentError.value = 'Otra persona modificó las inscripciones. Recargamos la versión actual; podés reintentar.'
      await loadWorkspace()
    } else {
      enrollmentError.value = 'No se pudo registrar la inscripción. Verificá la mesa y el ID del alumno.'
    }
  } finally {
    saving.value = false
  }
}

async function removeEnrollment(row: { alumno: { idUsuario: number; apellidoNombre: string } }): Promise<void> {
  if (!workspace.value || !window.confirm(`¿Dar de baja a ${row.alumno.apellidoNombre} de esta mesa?`)) return
  enrollmentError.value = ''
  saving.value = true
  try {
    await withdrawStudent(examId.value, row.alumno.idUsuario, workspace.value.detail.version)
    await loadWorkspace()
  } catch (cause) {
    if (isConflict(cause)) {
      enrollmentError.value = 'Otra persona modificó las inscripciones. Recargamos la versión actual; podés reintentar.'
      await loadWorkspace()
    } else {
      feedback.error('No se pudo dar de baja la inscripción.')
    }
  } finally {
    saving.value = false
  }
}

async function saveResult(input: ResultWriteInput) {
  return saveExamResult(examId.value, input)
}

async function reloadResults(): Promise<ExamResultsSnapshot> {
  const snapshot = await reloadExamResults(examId.value)
  if (workspace.value) {
    workspace.value = { ...workspace.value, results: snapshot.results, detail: { ...workspace.value.detail, version: snapshot.version } }
  }
  return snapshot
}

function routeReady(): void {
  if (isList.value) void Promise.all([loadList(), loadOptions()])
  else if (isDetail.value) void Promise.all([loadWorkspace(), loadOptions()])
  else void loadForm()
}

watch(() => route.fullPath, routeReady)
onMounted(routeReady)
</script>

<template>
    <main aria-labelledby="admin-exams-title" class="mx-auto max-w-6xl" :class="{ 'exam-detail-finalized': workspace?.detail.estadoMesa === 'FINALIZADA' }">
    <div class="flex flex-wrap items-end justify-between gap-4"><div><p class="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--color-brand)]">Administración</p><h1 id="admin-exams-title" class="mt-2 text-3xl font-semibold">Mesas de examen</h1><p class="mt-2 text-[var(--color-graphite)]">Configurá fechas, tribunales y resultados finales con publicación controlada.</p></div><RouterLink v-if="isList" :to="{ name: 'admin-exam-new' }" class="min-h-11 rounded-lg bg-[var(--color-brand)] px-4 py-2.5 font-semibold text-white">Nueva mesa</RouterLink></div>

    <template v-if="isList">
      <form class="mt-6 grid gap-3 rounded-xl border border-[var(--color-border)] bg-white p-4 sm:grid-cols-2 lg:grid-cols-4" @submit.prevent="applyFilters"><label class="text-sm font-semibold">Materia<select v-model="filters.materiaId" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-3 font-normal"><option value="">Todas</option><option v-for="subject in subjects" :key="subject.id" :value="subject.id">{{ subject.nombre }}</option></select></label><label class="text-sm font-semibold">Carrera<select v-model="filters.carreraId" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-3 font-normal"><option value="">Todas</option><option v-for="career in careers" :key="career.id" :value="career.id">{{ career.nombre }}</option></select></label><label class="text-sm font-semibold">Ciclo lectivo<input v-model="filters.cicloLectivo" inputmode="numeric" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] px-3 font-normal" /></label><label class="text-sm font-semibold">Estado<select v-model="filters.estadoMesa" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-3 font-normal"><option value="">Todos</option><option value="ABIERTA">Abierta</option><option value="EN_PROCESO">En proceso</option><option value="FINALIZADA">Finalizada</option></select></label><label class="text-sm font-semibold">Desde<input v-model="filters.fechaDesde" type="date" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] px-3 font-normal" /></label><label class="text-sm font-semibold">Hasta<input v-model="filters.fechaHasta" type="date" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] px-3 font-normal" /></label><div class="flex items-end gap-2 sm:col-span-2"><button type="submit" class="min-h-11 rounded-md bg-[var(--color-brand)] px-4 py-2 font-semibold text-white">Aplicar</button><button type="button" class="min-h-11 rounded-md border border-[var(--color-border)] px-4 py-2 font-semibold" @click="resetFilters">Limpiar</button></div></form>
      <p v-if="optionsError" class="mt-3 text-sm text-[#a31118]" role="alert">{{ optionsError }}</p>
      <div class="mt-5"><AdminExamsList :exams="exams" :pagination="pagination" :loading="loading" :error="error" empty-text="No hay mesas con esos filtros." detail-route-name="admin-exam-detail" :route-query="currentQuery()" @retry="loadList" @page="changePage" /></div>
    </template>

    <template v-else-if="(isCreate || isEdit) && formReady">
      <section class="mt-7 max-w-3xl rounded-xl border border-[var(--color-border)] bg-white p-6"><h2 class="text-2xl font-semibold">{{ isCreate ? 'Nueva mesa de examen' : 'Editar mesa de examen' }}</h2><p class="mt-2 text-sm text-[var(--color-graphite)]">Las fechas se interpretan en la zona institucional America/Argentina/Buenos_Aires.</p><form class="mt-5 grid gap-4 sm:grid-cols-2" @submit.prevent="saveForm"><label class="font-semibold sm:col-span-2">Materia<select v-if="subjects.length" v-model.number="form.materiaId" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-3 font-normal" :disabled="isEdit"><option :value="0">Seleccionar materia</option><option v-for="subject in subjects" :key="subject.id" :value="subject.id">{{ subject.nombre }}{{ subject.carrera?.nombre ? ` · ${subject.carrera.nombre}` : '' }}</option></select><input v-else v-model.number="form.materiaId" type="number" min="1" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] px-3 font-normal" :disabled="isEdit" placeholder="ID de materia" /></label><label class="font-semibold">Fecha y hora<input v-model="form.fecha" type="datetime-local" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] px-3 font-normal" /></label><label class="font-semibold">Tipo<select v-model="form.tipoExamen" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-3 font-normal"><option value="ORAL">Oral</option><option value="ESCRITO">Escrito</option></select></label><label class="font-semibold">Llamado<input v-model.number="form.llamado" type="number" min="1" max="3" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] px-3 font-normal" /></label><label class="font-semibold">Folio<input v-model="form.folioExamen" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] px-3 font-normal" /></label><label class="font-semibold">Libro<input v-model="form.libroExamen" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] px-3 font-normal" /></label><p v-if="optionsError" class="sm:col-span-2 text-sm text-[#a31118]" role="alert">{{ optionsError }}</p><p v-if="fieldError" class="sm:col-span-2 text-sm text-[#a31118]" role="alert">{{ fieldError }}</p><div class="flex gap-3 sm:col-span-2"><button type="submit" class="min-h-11 rounded-md bg-[var(--color-brand)] px-5 py-2 font-semibold text-white" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar mesa' }}</button><RouterLink :to="{ name: isCreate ? 'admin-exams' : 'admin-exam-detail', params: isCreate ? undefined : { id: examId }, query: route.query }" class="min-h-11 rounded-md border border-[var(--color-border)] px-5 py-2.5">Cancelar</RouterLink></div></form></section>
    </template>

    <template v-else-if="isEdit && !formReady">
      <div class="mt-7 rounded-xl border border-[var(--color-border)] bg-white p-6" role="status"><p v-if="fieldError" role="alert">{{ fieldError }}</p><p v-else>Cargando la mesa…</p></div>
    </template>

    <template v-else>
      <div class="mt-5"><RouterLink :to="{ name: 'admin-exams', query: route.query }" class="font-semibold text-[var(--color-brand)]">← Volver a mesas</RouterLink></div><div v-if="loading" class="mt-5 rounded-xl border border-[var(--color-border)] bg-white p-10 text-center" role="status">Cargando mesa…</div><div v-else-if="error" class="mt-5 rounded-xl border border-red-200 bg-red-50 p-6 text-red-800" role="alert"><p>{{ error }}</p><button type="button" class="mt-3 min-h-10 rounded-md bg-[var(--color-brand)] px-4 font-semibold text-white" @click="loadWorkspace">Reintentar</button></div><template v-else-if="workspace"><section class="mt-5 rounded-xl border border-[var(--color-border)] bg-white p-5 sm:p-6"><div class="flex flex-wrap items-start justify-between gap-4"><div><p class="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--color-brand)]">Detalle de mesa</p><h2 class="mt-2 text-2xl font-semibold">{{ workspace.detail.materia.nombre }}</h2><p class="mt-1 text-[var(--color-graphite)]">{{ workspace.detail.materia.carrera?.nombre ?? 'Carrera no informada' }} · {{ examDateLabel(workspace.detail.fecha) }} · {{ academicLabel(workspace.detail.tipoExamen) }} · llamado {{ workspace.detail.llamado }}</p><p class="mt-2 text-sm text-[var(--color-graphite)]">Estado: <strong>{{ academicLabel(workspace.detail.estadoMesa) }}</strong> · Versión {{ workspace.detail.version }}</p></div><RouterLink v-if="workspace.detail.estadoMesa !== 'FINALIZADA'" :to="{ name: 'admin-exam-edit', params: { id: examId }, query: route.query }" class="min-h-10 rounded-md bg-[var(--color-brand)] px-4 py-2 font-semibold text-white">Editar configuración</RouterLink></div><dl class="mt-5 grid gap-3 text-sm sm:grid-cols-3"><div><dt class="font-semibold">Libro</dt><dd>{{ workspace.detail.libroExamen || 'Sin informar' }}</dd></div><div><dt class="font-semibold">Folio</dt><dd>{{ workspace.detail.folioExamen || 'Sin informar' }}</dd></div><div><dt class="font-semibold">Publicación</dt><dd>{{ workspace.detail.publicadaEn ? examDateLabel(workspace.detail.publicadaEn) : 'Pendiente' }}</dd></div></dl></section><div class="mt-5"><ExamTribunalEditor :members="workspace.detail.tribunales" :teachers="teachers" :disabled="workspace.detail.estadoMesa === 'FINALIZADA'" :saving="saving" @add="addTribunal" @remove="removeTribunal" /></div><section class="mt-5 rounded-xl border border-[var(--color-border)] bg-white p-5 sm:p-6" aria-labelledby="enrollments-title"><h2 id="enrollments-title" class="text-xl font-semibold">Inscriptos</h2><form v-if="workspace.detail.estadoMesa !== 'FINALIZADA'" class="mt-4 grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end" @submit.prevent="addEnrollment"><label class="text-sm font-semibold">ID de cuenta del alumno<input v-model="studentId" inputmode="numeric" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] px-3 font-normal" placeholder="Ej. 13" /></label><label class="text-sm font-semibold">Condición<select v-model="studentCondition" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-3 font-normal"><option value="REGULAR">Regular</option><option value="LIBRE">Libre</option></select></label><button type="submit" class="min-h-11 rounded-md bg-[var(--color-brand)] px-4 py-2 font-semibold text-white" :disabled="saving">Inscribir</button></form><p v-if="enrollmentError" class="mt-3 text-sm text-[#a31118]" role="alert">{{ enrollmentError }}</p><ul class="mt-4 divide-y divide-[var(--color-border)]"> <li v-for="row in workspace.results" :key="row.id" class="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span><strong>{{ row.alumno.apellidoNombre }}</strong><span class="ml-2 text-[var(--color-graphite)]">{{ academicLabel(row.condicion) }}</span></span><button v-if="workspace.detail.estadoMesa !== 'FINALIZADA'" type="button" class="font-semibold text-[var(--color-brand)]" @click="removeEnrollment(row)">Dar de baja</button></li></ul><p v-if="!workspace.results.length" class="mt-4 text-sm text-[var(--color-graphite)]">No hay inscriptos activos.</p></section><ExamResultPanel :results="workspace.results" :version="workspace.detail.version" :status="workspace.detail.estadoMesa" :save-result="saveResult" :reload-results="reloadResults" :can-close="tribunalComplete(workspace.detail.tribunales)" :close-table="(version) => closeExamTable(examId, version)" :reopen-table="(reason, version) => reopenExamTable(examId, reason, version)" can-reopen @changed="loadWorkspace" /></template></template>
  </main>
</template>

<style scoped>
.exam-detail-finalized > div:first-child > a {
  display: none;
}

.exam-detail-finalized section:first-of-type > div > a {
  display: none;
}

:global(.exam-detail-finalized a[href$="/editar"]) {
  display: none !important;
}
</style>
