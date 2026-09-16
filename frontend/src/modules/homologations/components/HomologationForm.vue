<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { adminApi } from '@/modules/admin/api/adminApi'
import type { ActiveStudent } from '@/modules/admin/types/admin'
import { normalizeApiError } from '@/core/api/errors'
import { homologationsApi } from '../api/homologationsApi'
import { homologationReturnToQuery, normalizeHomologationReturnTo } from '../presentation'
import { createHomologationSchema } from '../schemas/homologationSchemas'
import type { HomologationType, StudentCareer, SubjectOption } from '../types/homologations'

type FormField = 'alumnoId' | 'materiaId' | 'calificacion' | 'observacion'

const SEARCH_DEBOUNCE_MS = 300

const route = useRoute()
const router = useRouter()
const students = ref<ActiveStudent[]>([])
const careers = ref<StudentCareer[]>([])
const subjects = ref<SubjectOption[]>([])
const studentSearch = ref('')
const loadingStudents = ref(false)
const loadingCareers = ref(false)
const loadingSubjects = ref(false)
const saving = ref(false)
const catalogError = ref('')
const fieldError = ref('')
const fieldErrors = ref<Partial<Record<FormField, string>>>({})
const errorRegion = ref<HTMLElement | null>(null)
const studentSelect = ref<HTMLSelectElement | null>(null)
const subjectSelect = ref<HTMLSelectElement | null>(null)
const previousGrade = ref<HTMLInputElement | null>(null)
const observation = ref<HTMLTextAreaElement | null>(null)
const form = reactive({
  alumnoId: '',
  carreraId: '',
  materiaId: '',
  tipoHomologacion: 'TOTAL' as HomologationType,
  calificacion: '',
  observacion: '',
})

let disposed = false
let studentRequestId = 0
let careerRequestId = 0
let subjectRequestId = 0
let searchTimer: ReturnType<typeof setTimeout> | null = null

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return normalizeApiError(error).message
}

function errorId(field: FormField): string {
  return 'homologation-' + field + '-error'
}

function describedBy(field: FormField, helpId?: string): string | undefined {
  const ids = [helpId, fieldErrors.value[field] ? errorId(field) : undefined].filter(Boolean)
  return ids.length ? ids.join(' ') : undefined
}

async function focusErrorRegion(): Promise<void> {
  await nextTick()
  errorRegion.value?.focus()
}

async function focusField(field: string): Promise<void> {
  await nextTick()
  const control = field === 'alumnoId'
    ? studentSelect.value
    : field === 'materiaId'
      ? subjectSelect.value
      : field === 'calificacion'
        ? previousGrade.value
        : field === 'observacion'
          ? observation.value
          : null
  if (control) control.focus()
  else await focusErrorRegion()
}

function setCatalogError(error: unknown): void {
  catalogError.value = errorMessage(error)
  void focusErrorRegion()
}

function queryValue(key: string): string | undefined {
  const value = route.query[key]
  return Array.isArray(value) ? value[0] : value ?? undefined
}

function safeReturnTo(value: unknown): string | undefined {
  return normalizeHomologationReturnTo(value) ?? undefined
}

function cancel(): void {
  const query = homologationReturnToQuery(queryValue('returnTo'))
  void router.replace({
    name: 'admin-homologations',
    ...(Object.keys(query).length ? { query } : {}),
  })
}

function resetCareerCatalog(): void {
  careerRequestId += 1
  subjectRequestId += 1
  loadingCareers.value = false
  loadingSubjects.value = false
  careers.value = []
  subjects.value = []
  form.carreraId = ''
  form.materiaId = ''
}

function resetSubjectCatalog(): void {
  subjectRequestId += 1
  loadingSubjects.value = false
  subjects.value = []
  form.materiaId = ''
}

async function loadStudents(search = '', requestId = ++studentRequestId): Promise<void> {
  loadingStudents.value = true
  catalogError.value = ''
  try {
    const result = await adminApi.listActiveStudents(search.trim() || undefined, { limit: 50 })
    if (disposed || requestId !== studentRequestId) return
    students.value = result.data
  } catch (error) {
    if (!disposed && requestId === studentRequestId) {
      students.value = []
      setCatalogError(error)
    }
  } finally {
    if (!disposed && requestId === studentRequestId) loadingStudents.value = false
  }
}

function scheduleStudentSearch(): void {
  if (searchTimer !== null) clearTimeout(searchTimer)
  const requestId = ++studentRequestId
  loadingStudents.value = true
  searchTimer = setTimeout(() => {
    searchTimer = null
    void loadStudents(studentSearch.value, requestId)
  }, SEARCH_DEBOUNCE_MS)
}

async function loadCareers(usuarioId: number): Promise<void> {
  const requestId = ++careerRequestId
  loadingCareers.value = true
  catalogError.value = ''
  try {
    const result = await homologationsApi.listStudentCareers(usuarioId)
    if (disposed || requestId !== careerRequestId || form.alumnoId !== String(usuarioId)) return
    careers.value = result.filter((enrollment) => enrollment.activo && enrollment.carrera.activo)
  } catch (error) {
    if (!disposed && requestId === careerRequestId) {
      careers.value = []
      setCatalogError(error)
    }
  } finally {
    if (!disposed && requestId === careerRequestId) loadingCareers.value = false
  }
}

async function loadSubjects(carreraId: number): Promise<void> {
  const requestId = ++subjectRequestId
  loadingSubjects.value = true
  catalogError.value = ''
  try {
    const result = await homologationsApi.listCareerSubjects(carreraId)
    if (disposed || requestId !== subjectRequestId || form.carreraId !== String(carreraId)) return
    subjects.value = result.filter((subject) => subject.activo === true)
  } catch (error) {
    if (!disposed && requestId === subjectRequestId) {
      subjects.value = []
      setCatalogError(error)
    }
  } finally {
    if (!disposed && requestId === subjectRequestId) loadingSubjects.value = false
  }
}

function onStudentChange(): void {
  resetCareerCatalog()
  catalogError.value = ''
  const usuarioId = Number(form.alumnoId)
  if (Number.isInteger(usuarioId) && usuarioId > 0) void loadCareers(usuarioId)
}

function onCareerChange(): void {
  resetSubjectCatalog()
  catalogError.value = ''
  const carreraId = Number(form.carreraId)
  if (Number.isInteger(carreraId) && carreraId > 0) void loadSubjects(carreraId)
}

function onTypeChange(): void {
  if (form.tipoHomologacion === 'PARCIAL') form.calificacion = ''
}

async function submit(): Promise<void> {
  if (saving.value) return
  fieldError.value = ''
  fieldErrors.value = {}
  const result = createHomologationSchema.safeParse({
    alumnoId: form.alumnoId,
    materiaId: form.materiaId,
    tipoHomologacion: form.tipoHomologacion,
    calificacion: form.calificacion,
    observacion: form.observacion.trim() || null,
  })
  if (!result.success) {
    const errors: Partial<Record<FormField, string>> = {}
    for (const issue of result.error.issues) {
      const field = issue.path[0]
      if (field === 'alumnoId' || field === 'materiaId' || field === 'calificacion' || field === 'observacion') errors[field] ??= issue.message
    }
    fieldErrors.value = errors
    const firstIssue = result.error.issues[0]
    if (firstIssue) void focusField(String(firstIssue.path[0]))
    else {
      fieldError.value = 'Revisá los datos.'
      void focusErrorRegion()
    }
    return
  }

  const payload = result.data.tipoHomologacion === 'TOTAL'
    ? {
        alumnoId: result.data.alumnoId,
        materiaId: result.data.materiaId,
        tipoHomologacion: 'TOTAL' as const,
        calificacion: result.data.calificacion as number,
        observacion: result.data.observacion ?? null,
      }
    : {
        alumnoId: result.data.alumnoId,
        materiaId: result.data.materiaId,
        tipoHomologacion: 'PARCIAL' as const,
        calificacion: null,
        observacion: result.data.observacion ?? null,
      }

  saving.value = true
  try {
    const response = await homologationsApi.create(payload)
    const returnTo = safeReturnTo(queryValue('returnTo'))
    await router.replace({
      name: 'admin-homologation-detail',
      params: { id: response.data.id },
      ...(returnTo ? { query: { returnTo } } : {}),
    })
  } catch (error) {
    fieldError.value = errorMessage(error)
    void focusErrorRegion()
  } finally {
    saving.value = false
  }
}

onMounted(() => { void loadStudents() })
onBeforeUnmount(() => {
  disposed = true
  studentRequestId += 1
  careerRequestId += 1
  subjectRequestId += 1
  if (searchTimer !== null) clearTimeout(searchTimer)
})
</script>

<template>
  <section aria-labelledby="new-homologation-title" class="mt-6 max-w-4xl rounded-xl border border-[var(--color-border)] bg-white p-4 sm:p-6">
    <h2 id="new-homologation-title" class="text-2xl font-semibold">Nueva homologación</h2>
    <p class="mt-2 text-[var(--color-graphite)]">Completá los datos de la trayectoria previa del alumno.</p>

    <div id="homologation-form-status" ref="errorRegion" tabindex="-1" class="mt-4 min-h-6 text-sm outline-none" aria-live="polite">
      <p v-if="catalogError" class="field-error" role="alert">{{ catalogError }}</p>
      <p v-if="fieldError" class="field-error" role="alert">{{ fieldError }}</p>
    </div>

    <form class="mt-4" @submit.prevent="submit">
      <fieldset :disabled="saving" class="grid min-w-0 grid-cols-1 gap-5 border-0 p-0 md:grid-cols-2">
        <legend class="sr-only">Datos de la homologación</legend>

        <div class="min-w-0">
          <label for="student-search" class="font-semibold">Buscar alumno</label>
          <input id="student-search" v-model="studentSearch" type="search" class="admin-input" placeholder="Nombre, DNI o email" aria-describedby="student-search-help" @input="scheduleStudentSearch" />
          <p id="student-search-help" class="mt-1 text-sm text-[var(--color-graphite)]">La búsqueda consulta alumnos activos en el servidor.</p>
        </div>

        <div class="min-w-0">
          <label for="active-student" class="font-semibold">Alumno activo</label>
          <select id="active-student" ref="studentSelect" v-model="form.alumnoId" class="admin-input" :aria-invalid="Boolean(fieldErrors.alumnoId)" :aria-describedby="describedBy('alumnoId', 'homologation-form-status')" @change="onStudentChange">
            <option value="">Seleccioná un alumno</option>
            <option v-for="student in students" :key="student.idUsuario" :value="String(student.idUsuario)">{{ student.apellidoNombre }} · DNI {{ student.dni }}</option>
          </select>
          <p v-if="fieldErrors.alumnoId" :id="errorId('alumnoId')" class="field-error" role="alert">{{ fieldErrors.alumnoId }}</p>
        </div>

        <div class="min-w-0">
          <label for="active-career" class="font-semibold">Carrera activa</label>
          <select id="active-career" v-model="form.carreraId" class="admin-input" :disabled="!form.alumnoId || loadingCareers" :aria-busy="loadingCareers" aria-describedby="homologation-form-status" @change="onCareerChange">
            <option value="">Seleccioná una carrera</option>
            <option v-for="enrollment in careers" :key="enrollment.carreraId" :value="String(enrollment.carreraId)">{{ enrollment.carrera.nombre }}</option>
          </select>
        </div>

        <div class="min-w-0">
          <label for="active-subject" class="font-semibold">Materia activa</label>
          <select id="active-subject" ref="subjectSelect" v-model="form.materiaId" class="admin-input" :disabled="!form.carreraId || loadingSubjects" :aria-busy="loadingSubjects" :aria-invalid="Boolean(fieldErrors.materiaId)" :aria-describedby="describedBy('materiaId', 'homologation-form-status')">
            <option value="">Seleccioná una materia</option>
            <option v-for="subject in subjects" :key="subject.id" :value="String(subject.id)">{{ subject.nombre }}</option>
          </select>
          <p v-if="fieldErrors.materiaId" :id="errorId('materiaId')" class="field-error" role="alert">{{ fieldErrors.materiaId }}</p>
        </div>

        <fieldset class="min-w-0 md:col-span-2" aria-describedby="homologation-type-help">
          <legend class="font-semibold">Tipo de homologación</legend>
          <div class="mt-2 flex flex-wrap gap-4">
            <label class="inline-flex min-h-11 items-center gap-2"><input v-model="form.tipoHomologacion" type="radio" value="TOTAL" name="homologation-type" @change="onTypeChange" /> Total</label>
            <label class="inline-flex min-h-11 items-center gap-2"><input v-model="form.tipoHomologacion" type="radio" value="PARCIAL" name="homologation-type" @change="onTypeChange" /> Parcial</label>
          </div>
          <p id="homologation-type-help" class="mt-1 text-sm text-[var(--color-graphite)]">Total registra la nota de la institución anterior; parcial deja la nota definitiva para el examen complementario.</p>
        </fieldset>

        <div v-if="form.tipoHomologacion === 'TOTAL'" class="min-w-0">
          <label for="previous-grade" class="font-semibold">Nota de la institución anterior</label>
          <input id="previous-grade" ref="previousGrade" v-model="form.calificacion" type="number" min="0" max="10" step="1" inputmode="numeric" class="admin-input" :aria-invalid="Boolean(fieldErrors.calificacion)" :aria-describedby="describedBy('calificacion', 'previous-grade-help')" />
          <p id="previous-grade-help" class="mt-1 text-sm text-[var(--color-graphite)]">Debe ser un número entero entre 0 y 10.</p>
          <p v-if="fieldErrors.calificacion" :id="errorId('calificacion')" class="field-error" role="alert">{{ fieldErrors.calificacion }}</p>
        </div>
        <p v-else class="rounded-lg bg-[#f6f7f4] p-3 text-sm text-[var(--color-graphite)] md:col-span-2">La nota definitiva se cargará después del examen complementario.</p>

        <div class="min-w-0 md:col-span-2">
          <label for="homologation-observation" class="font-semibold">Observación</label>
          <textarea id="homologation-observation" ref="observation" v-model="form.observacion" rows="4" maxlength="2000" class="admin-input" :aria-invalid="Boolean(fieldErrors.observacion)" :aria-describedby="describedBy('observacion', 'observation-help')" />
          <p id="observation-help" class="mt-1 text-sm text-[var(--color-graphite)]">Opcional, hasta 2000 caracteres.</p>
          <p v-if="fieldErrors.observacion" :id="errorId('observacion')" class="field-error" role="alert">{{ fieldErrors.observacion }}</p>
        </div>

        <div class="flex flex-wrap gap-3 md:col-span-2">
          <button type="submit" class="min-h-11 rounded-lg bg-[var(--color-brand)] px-5 py-2.5 font-semibold text-white disabled:opacity-50" :disabled="saving" :aria-busy="saving">{{ saving ? 'Creando…' : 'Crear homologación' }}</button>
          <button type="button" class="min-h-11 rounded-lg border border-[var(--color-border)] px-5 py-2.5" :disabled="saving" @click="cancel">Cancelar</button>
        </div>
      </fieldset>
    </form>
  </section>
</template>

<style scoped>
.admin-input { margin-top: .25rem; min-height: 2.75rem; width: 100%; min-width: 0; border: 1px solid var(--color-border); border-radius: .5rem; padding: 0 .75rem; font-weight: 400; }
textarea.admin-input { padding-top: .6rem; }
.field-error { color: #a31118; }
</style>
