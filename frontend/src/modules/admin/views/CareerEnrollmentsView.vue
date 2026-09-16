<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AdminPagination from '../components/AdminPagination.vue'
import AdminState from '../components/AdminState.vue'
import AdminTable from '../components/AdminTable.vue'
import { adminApi } from '../api/adminApi'
import { careerEnrollmentSchema } from '../schemas/adminSchemas'
import type { ActiveStudent, Career, CareerEnrollment } from '../types/admin'
import { normalizeApiError } from '@/core/api/errors'
import { useFeedback } from '@/ui/feedback'

const route = useRoute()
const router = useRouter()
const feedback = useFeedback()
const students = ref<ActiveStudent[]>([])
const careers = ref<Career[]>([])
const enrollments = ref<CareerEnrollment[]>([])
const studentSearch = ref('')
const selectedCareerId = ref<number | null>(null)
const loadingCatalogs = ref(false)
const loadingEnrollments = ref(false)
const catalogError = ref('')
const enrollmentError = ref('')
const saving = ref(false)
const pagination = ref({ page: 1, limit: 20, total: 0, totalPages: 0 })
const form = reactive({ alumnoId: '', cicloLectivo: new Date().getFullYear() })
let enrollmentRequestId = 0
let studentSearchRequestId = 0
let rosterRouteKey = ''

function queryValue(key: string): string | undefined {
  const value = route.query[key]
  return Array.isArray(value) ? value[0] : value
}

function routeCareerId(): number | null {
  const value = Number(queryValue('carreraId'))
  return Number.isInteger(value) && value > 0 ? value : null
}

function routePage(): number {
  const value = Number(queryValue('page'))
  return Number.isInteger(value) && value > 0 ? value : 1
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return normalizeApiError(error).message
}

async function loadCatalogs(): Promise<void> {
  loadingCatalogs.value = true
  catalogError.value = ''
  careers.value = []
  try {
    const studentResult = await adminApi.listActiveStudents(undefined, { limit: 50 })
    const careerResult = await adminApi.listActiveCareers()
    students.value = studentResult.data.filter((student) => student.activo)
    careers.value = careerResult.data
    selectedCareerId.value = routeCareerId()
    if (!careers.value.some((career) => career.id === selectedCareerId.value)) {
      selectedCareerId.value = careers.value[0]?.id ?? null
      if (selectedCareerId.value) await router.replace({ query: { ...route.query, carreraId: String(selectedCareerId.value), page: undefined } })
    }
  } catch (error) {
    careers.value = []
    catalogError.value = errorMessage(error)
  } finally { loadingCatalogs.value = false }
}

async function searchStudents(): Promise<void> {
  const requestId = ++studentSearchRequestId
  try {
    const result = await adminApi.listActiveStudents(studentSearch.value.trim() || undefined, { limit: 50 })
    if (requestId === studentSearchRequestId) students.value = result.data.filter((student) => student.activo)
  } catch (error) {
    if (requestId === studentSearchRequestId) feedback.error(errorMessage(error))
  }
}

async function loadEnrollments(page = routePage(), careerId = selectedCareerId.value): Promise<void> {
  const requestId = ++enrollmentRequestId
  if (!careerId) {
    enrollments.value = []
    pagination.value = { page: 1, limit: 20, total: 0, totalPages: 0 }
    enrollmentError.value = ''
    loadingEnrollments.value = false
    return
  }
  loadingEnrollments.value = true
  enrollmentError.value = ''
  try {
    const result = await adminApi.listCareerEnrollments(careerId, { page, limit: 20 })
    if (requestId !== enrollmentRequestId) return
    if (result.pagination.totalPages < page) {
      const validPage = result.pagination.totalPages > 0 ? result.pagination.totalPages : 1
      const query = { ...route.query, page: result.pagination.totalPages > 0 ? String(validPage) : undefined }
      await router.replace({ query })
      if (requestId === enrollmentRequestId) await syncRosterFromRoute()
      return
    }
    enrollments.value = result.data.filter((enrollment) => enrollment.activo)
    pagination.value = result.pagination
  } catch (error) {
    if (requestId === enrollmentRequestId) enrollmentError.value = errorMessage(error)
  } finally {
    if (requestId === enrollmentRequestId) loadingEnrollments.value = false
  }
}

function resetRoster(): void {
  enrollmentRequestId += 1
  enrollments.value = []
  pagination.value = { page: 1, limit: 20, total: 0, totalPages: 0 }
  enrollmentError.value = ''
  loadingEnrollments.value = false
}

async function selectCareer(): Promise<void> {
  resetRoster()
  try {
    await router.replace({ query: { ...route.query, carreraId: selectedCareerId.value ? String(selectedCareerId.value) : undefined, page: undefined } })
  } catch (error) {
    feedback.error(errorMessage(error))
  }
}

async function changePage(page: number): Promise<void> {
  await router.replace({ query: { ...route.query, page: String(page) } })
}

async function syncRosterFromRoute(): Promise<void> {
  const careerId = routeCareerId()
  const page = routePage()
  selectedCareerId.value = careerId
  const key = `${careerId ?? ''}:${page}`
  if (key === rosterRouteKey) return
  rosterRouteKey = key
  resetRoster()
  await loadEnrollments(page, careerId)
}

async function enroll(): Promise<void> {
  const result = careerEnrollmentSchema.safeParse({ alumnoId: form.alumnoId, carreraId: selectedCareerId.value, cicloLectivo: form.cicloLectivo })
  if (!result.success) { feedback.error(result.error.issues[0]?.message ?? 'Revisá los datos.'); return }
  saving.value = true
  try {
    const response = await adminApi.enrollInCareer(result.data)
    feedback.success(response.message ?? (response.data.reactivada ? 'Inscripción a la carrera reactivada exitosamente' : 'Alumno inscripto a la carrera exitosamente'))
    await loadEnrollments()
  } catch (error) { feedback.error(errorMessage(error)) } finally { saving.value = false }
}

async function removeEnrollment(id: number): Promise<void> {
  if (!window.confirm('¿Dar de baja esta inscripción a la carrera?')) return
  try { await adminApi.removeCareerEnrollment(id); feedback.success('Baja de carrera realizada exitosamente'); await loadEnrollments(pagination.value.page) }
  catch (error) { feedback.error(errorMessage(error)) }
}

function formatDate(value: string): string { return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short' }).format(new Date(value)) }
watch(() => route.fullPath, () => { void syncRosterFromRoute() })

onMounted(async () => {
  await loadCatalogs()
  await syncRosterFromRoute()
})
</script>

<template>
  <main aria-labelledby="career-enrollments-title" class="mx-auto max-w-6xl">
    <p class="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--color-brand)]">Administración</p>
    <h1 id="career-enrollments-title" class="mt-2 text-3xl font-semibold">Inscripciones a carreras</h1>
    <AdminState :loading="loadingCatalogs" :error="catalogError" @retry="loadCatalogs">
      <form class="rounded-xl border border-[var(--color-border)] bg-white p-5" aria-labelledby="new-enrollment-title" @submit.prevent="enroll">
        <h2 id="new-enrollment-title" class="sr-only">Inscribir alumno</h2>
        <fieldset :disabled="saving" class="grid gap-5 lg:grid-cols-[1fr_1fr_12rem_auto]"><legend class="sr-only">Datos de la inscripción</legend>
          <div><label for="student-search" class="font-semibold">Buscar alumno</label><input id="student-search" v-model="studentSearch" type="search" class="admin-input" placeholder="Nombre, DNI o email" @input="searchStudents" /></div>
          <div><label for="active-student" class="font-semibold">Alumno activo</label><select id="active-student" v-model="form.alumnoId" class="admin-input"><option value="">Seleccioná un alumno</option><option v-for="student in students" :key="student.idUsuario" :value="String(student.idUsuario)">{{ student.apellidoNombre }} · DNI {{ student.dni }}</option></select></div>
          <div><label for="enrollment-year" class="font-semibold">Ciclo lectivo</label><input id="enrollment-year" v-model.number="form.cicloLectivo" type="number" min="2000" max="2100" class="admin-input" /></div>
          <div><label for="career-select" class="font-semibold">Carrera activa</label><select id="career-select" v-model.number="selectedCareerId" class="admin-input" @change="selectCareer"><option :value="null">Seleccioná una carrera</option><option v-for="career in careers" :key="career.id" :value="career.id">{{ career.nombre }}</option></select></div>
          <button type="submit" class="min-h-11 self-end rounded-lg bg-[var(--color-brand)] px-4 py-2.5 font-semibold text-white disabled:opacity-50" :aria-busy="saving">{{ saving ? 'Inscribiendo…' : 'Inscribir alumno' }}</button>
        </fieldset>
      </form>
      <section class="mt-7" aria-labelledby="roster-title">
        <h2 id="roster-title" class="text-2xl font-semibold">Nómina activa</h2>
        <AdminState :loading="loadingEnrollments" :error="enrollmentError" :empty="!selectedCareerId || (!enrollments.length && !loadingEnrollments && !enrollmentError)" empty-text="No hay alumnos activos inscriptos en esta carrera." @retry="loadEnrollments">
          <AdminTable :columns="[{ key: 'student', label: 'Alumno' }, { key: 'dni', label: 'DNI' }, { key: 'email', label: 'Correo' }, { key: 'year', label: 'Ciclo lectivo' }, { key: 'date', label: 'Fecha de inscripción' }]">
            <template #rows><tr v-for="enrollment in enrollments" :key="enrollment.id" class="border-t border-[var(--color-border)]"><td class="px-4 py-3">{{ enrollment.usuario.apellidoNombre }}</td><td class="px-4 py-3">{{ enrollment.usuario.dni }}</td><td class="px-4 py-3">{{ enrollment.usuario.email }}</td><td class="px-4 py-3">{{ enrollment.cicloLectivo }}</td><td class="px-4 py-3">{{ formatDate(enrollment.fechaInscripcion) }}</td><td class="px-4 py-3 text-right"><button type="button" class="font-semibold text-[var(--color-brand)]" :aria-label="`Dar de baja a ${enrollment.usuario.apellidoNombre}`" @click="removeEnrollment(enrollment.id)">Dar de baja</button></td></tr></template>
            <template #cards><article v-for="enrollment in enrollments" :key="enrollment.id" class="rounded-lg border border-[var(--color-border)] p-4"><h3 class="font-semibold">{{ enrollment.usuario.apellidoNombre }}</h3><p class="mt-1 text-sm text-[var(--color-graphite)]">DNI {{ enrollment.usuario.dni }} · {{ enrollment.usuario.email }}</p><p class="mt-2 text-sm">Ciclo {{ enrollment.cicloLectivo }} · Inscripto el {{ formatDate(enrollment.fechaInscripcion) }}</p><button type="button" class="mt-3 min-h-11 rounded-md border border-[var(--color-brand)] px-3 py-2 text-sm font-semibold text-[var(--color-brand)]" :aria-label="`Dar de baja a ${enrollment.usuario.apellidoNombre}`" @click="removeEnrollment(enrollment.id)">Dar de baja</button></article></template>
          </AdminTable>
          <AdminPagination class="mt-3" :pagination="pagination" @change="changePage" />
        </AdminState>
      </section>
    </AdminState>
  </main>
</template>

<style scoped>
.admin-input { margin-top: .25rem; min-height: 2.75rem; width: 100%; border: 1px solid var(--color-border); border-radius: .5rem; padding: 0 .75rem; font-weight: 400; }
</style>
