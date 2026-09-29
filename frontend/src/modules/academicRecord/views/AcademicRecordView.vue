<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { fetchAcademicRecordAttendance, fetchAcademicRecordCareers, fetchAcademicRecordTrajectory } from '../api/academicRecordApi'
import type { AcademicRecordAttendance, AcademicRecordCareer, AcademicRecordSubject, AcademicRecordTrajectory } from '../types/academicRecord'
import { useAuthStore } from '@/stores/authStore'
import AppButton from '@/ui/AppButton.vue'
import { academicLabel, formatAcademicDate } from '@/core/presentation/academicLabels'

const auth = useAuthStore()
const careers = ref<AcademicRecordCareer[]>([])
const selectedCareerId = ref<number | null>(null)
const trajectory = ref<AcademicRecordTrajectory | null>(null)
const loading = ref(false)
const error = ref('')
const expanded = ref<string | null>(null)
const selectedCourseIds = ref<Record<string, number>>({})
const attendance = ref<AcademicRecordAttendance[]>([])
const attendancePagination = ref({ page: 1, limit: 20, total: 0, totalPages: 0 })
const attendanceRequestedPage = ref(1)
const attendanceLoading = ref(false)
const attendanceError = ref('')
let loadRequest = 0
let attendanceRequest = 0
let mounted = true
const REGULARITY_ALERT_WINDOW_DAYS = 90

const selectedCareer = computed(() => careers.value.find((career) => career.carreraId === selectedCareerId.value)?.carrera)
const regularityAlerts = computed(() => {
  if (!trajectory.value) return []
  const today = argentinaCalendarDate(new Date())
  if (!today) return []
  return trajectory.value.materias
    .map((subject, index) => {
      const until = subject.regularidad?.hasta
      const deadline = parseCalendarDate(until)
      if (subject.estado !== 'REGULAR' || subject.definitiva || subject.regularidad?.vencida || !deadline) return null
      const daysRemaining = Math.round((deadline.getTime() - today.getTime()) / 86_400_000)
      if (daysRemaining < 0 || daysRemaining > REGULARITY_ALERT_WINDOW_DAYS) return null
      return { subject, daysRemaining, deadline, index }
    })
    .filter((alert): alert is { subject: AcademicRecordSubject; daysRemaining: number; deadline: Date; index: number } => alert !== null)
    .sort((left, right) => {
      const byDeadline = left.deadline.getTime() - right.deadline.getTime()
      return byDeadline || left.subject.materia.id - right.subject.materia.id || left.index - right.index
    })
})
const identity = () => ({ userId: auth.user?.idUsuario ?? null, role: auth.activeRole ?? null })

function parseCalendarDate(value?: string | null): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value ?? '')
  if (!match) return null
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null
}

function argentinaCalendarDate(now: Date): Date | null {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return parseCalendarDate(`${values.year}-${values.month}-${values.day}`)
}

function invalidateAttendance(): void {
  attendanceRequest++
  expanded.value = null
  attendance.value = []
  attendanceError.value = ''
  attendancePagination.value = { page: 1, limit: 20, total: 0, totalPages: 0 }
  attendanceRequestedPage.value = 1
  attendanceLoading.value = false
  selectedCourseIds.value = {}
}

async function loadTrajectory(userId: number, careerId: number, request: number): Promise<void> {
  const snapshot = identity()
  try {
    const result = await fetchAcademicRecordTrajectory(userId, careerId)
    if (!mounted || request !== loadRequest || identity().userId !== snapshot.userId || identity().role !== snapshot.role || selectedCareerId.value !== careerId) return
    trajectory.value = result
  } catch {
    if (mounted && request === loadRequest && identity().userId === snapshot.userId && identity().role === snapshot.role && selectedCareerId.value === careerId) { trajectory.value = null; error.value = 'No pudimos cargar tu trayectoria académica.' }
  }
}

async function load(preserveCareer = false): Promise<void> {
  const current = identity()
  const request = ++loadRequest
  const previousCareerId = selectedCareerId.value
  invalidateAttendance()
  trajectory.value = null
  selectedCareerId.value = null
  if (current.userId === null || current.role !== 'ALUMNO' || !mounted) {
    careers.value = []
    trajectory.value = null
    selectedCareerId.value = null
    loading.value = false
    error.value = ''
    return
  }
  loading.value = true
  error.value = ''
  try {
    const result = (await fetchAcademicRecordCareers(current.userId)).filter((career) => career.activo !== false && career.carrera.activo !== false)
    if (!mounted || request !== loadRequest || identity().userId !== current.userId || identity().role !== current.role) return
    careers.value = result
    const careerId = preserveCareer && result.some((career) => career.carreraId === previousCareerId)
      ? previousCareerId
      : result[0]?.carreraId ?? null
    selectedCareerId.value = careerId
    if (careerId !== null) await loadTrajectory(current.userId, careerId, request)
  } catch {
    if (mounted && request === loadRequest && identity().userId === current.userId && identity().role === current.role) { careers.value = []; error.value = 'No pudimos cargar tu trayectoria académica.' }
  } finally {
    if (mounted && request === loadRequest) loading.value = false
  }
}

function courseOptions(subject: AcademicRecordSubject) { return subject.cursadas ?? [] }
function subjectKey(subject: AcademicRecordSubject): string { return String(subject.materia.id) }
function selectedCourse(subject: AcademicRecordSubject) {
  const courses = courseOptions(subject)
  return courses.find((course) => course.cursadaId === selectedCourseIds.value[subjectKey(subject)]) ?? courses[0]
}

async function loadAttendance(subject: AcademicRecordSubject, cursadaId: number, page = attendanceRequestedPage.value): Promise<void> {
  const current = identity()
  const careerId = selectedCareerId.value
  if (current.userId === null || careerId === null || !mounted) return
  const request = ++attendanceRequest
  attendanceRequestedPage.value = page
  attendanceLoading.value = true
  attendanceError.value = ''
  attendance.value = []
  selectedCourseIds.value[subjectKey(subject)] = cursadaId
  try {
    const result = await fetchAcademicRecordAttendance(current.userId, { carreraId: careerId, cursadaId, page })
    if (!mounted || request !== attendanceRequest || expanded.value !== subjectKey(subject) || identity().userId !== current.userId || identity().role !== current.role || selectedCareerId.value !== careerId) return
    attendance.value = result.data
    attendancePagination.value = result.pagination
  } catch {
    if (mounted && request === attendanceRequest && identity().userId === current.userId && identity().role === current.role && selectedCareerId.value === careerId) { attendance.value = []; attendanceError.value = 'No pudimos cargar las asistencias.' }
  } finally {
    if (mounted && request === attendanceRequest) attendanceLoading.value = false
  }
}

function toggleAttendance(subject: AcademicRecordSubject): void {
  const key = subjectKey(subject)
  if (expanded.value === key) { invalidateAttendance(); return }
  invalidateAttendance()
  expanded.value = key
  const course = courseOptions(subject)[0]
  if (course) void loadAttendance(subject, course.cursadaId, 1)
}

function retryAttendance(subject: AcademicRecordSubject): void {
  const course = selectedCourse(subject)
  if (course) void loadAttendance(subject, course.cursadaId, attendanceRequestedPage.value)
}

function changeCareer(event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLSelectElement)) return
  const careerId = Number(target.value)
  if (careerId === selectedCareerId.value || !auth.user || auth.activeRole !== 'ALUMNO') return
  const request = ++loadRequest
  invalidateAttendance()
  selectedCareerId.value = careerId
  trajectory.value = null
  error.value = ''
  loading.value = true
  void loadTrajectory(auth.user.idUsuario, careerId, request).finally(() => {
    if (mounted && request === loadRequest) loading.value = false
  })
}

function changeAttendanceCourse(subject: AcademicRecordSubject, event: Event): void {
  const target = event.target
  if (target instanceof HTMLSelectElement) void loadAttendance(subject, Number(target.value), 1)
}

watch(() => [auth.user?.idUsuario ?? null, auth.activeRole ?? null], ([userId, role], previous) => {
  if (userId !== previous[0] || role !== previous[1]) void load()
})
onMounted(() => { void load() })
onUnmounted(() => { mounted = false; loadRequest++; attendanceRequest++ })
</script>

<template>
  <main class="mx-auto max-w-5xl" aria-labelledby="academic-record-title">
    <p class="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--color-brand)]">Autogestión académica</p>
    <h1 id="academic-record-title" class="mt-2 text-3xl font-semibold text-[var(--color-text)]">Mi trayectoria académica</h1>
    <p class="mt-2 text-[var(--color-graphite)]">Consultá el estado integral informado por la institución.</p>

    <section v-if="loading" class="mt-7 rounded-lg border border-[var(--color-border)] bg-white p-5" role="status">Cargando trayectoria académica…</section>
    <section v-else-if="error" class="mt-7 rounded-lg border border-[#a31118]/30 bg-[#fff7f6] p-5" role="alert">
      <p>{{ error }}</p>
      <AppButton class="mt-4" variant="secondary" @click="load(true)">Reintentar</AppButton>
    </section>
    <section v-else-if="!careers.length" class="mt-7 rounded-lg border border-[var(--color-border)] bg-white p-5">No tenés carreras activas para consultar.</section>

    <template v-else-if="trajectory">
      <label for="academic-career" class="mt-7 block max-w-xl font-semibold text-[var(--color-text)]">Carrera
        <select id="academic-career" :value="selectedCareerId" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-3 font-normal" @change="changeCareer">
          <option v-for="career in careers" :key="career.id" :value="career.carreraId">{{ career.carrera.nombre }}</option>
        </select>
      </label>
      <section class="mt-6 rounded-lg border border-[var(--color-border)] bg-white p-5" aria-labelledby="record-summary">
        <h2 id="record-summary" class="text-xl font-semibold">{{ selectedCareer?.nombre }}</h2>
        <p class="mt-2 font-semibold">Promedio general: {{ trajectory.promedioGeneral ?? 'sin calificaciones definitivas' }}</p>
        <p class="mt-1 text-sm text-[var(--color-graphite)]">{{ trajectory.cantidadMateriasAprobadas ?? 0 }} materias aprobadas</p>
      </section>
      <nav class="mt-5 flex flex-wrap gap-3" aria-label="Próximos pasos académicos">
        <RouterLink :to="{ name: 'subject-enrollments' }" class="inline-flex min-h-11 items-center rounded-md border border-[var(--color-brand)] px-4 py-2 font-semibold text-[var(--color-brand)]">Consultar materias e inscripciones</RouterLink>
        <RouterLink :to="{ name: 'student-exams' }" class="inline-flex min-h-11 items-center rounded-md border border-[var(--color-brand)] px-4 py-2 font-semibold text-[var(--color-brand)]">Consultar próximos exámenes</RouterLink>
      </nav>

      <section v-if="regularityAlerts.length" class="mt-6 rounded-lg border border-[#c98924]/40 bg-[#fffaf0] p-5" aria-labelledby="regularity-alerts-title">
        <h2 id="regularity-alerts-title" class="text-xl font-semibold">Regularidades próximas a vencer</h2>
        <ul class="mt-3 grid gap-3" aria-label="Regularidades próximas a vencer">
          <li v-for="alert in regularityAlerts" :key="alert.subject.materia.id" class="rounded-md border border-[#c98924]/30 bg-white p-3">
            <p class="font-semibold">{{ alert.subject.materia.nombre }}</p>
            <p class="mt-1 text-sm">Vence el {{ formatAcademicDate(alert.subject.regularidad?.hasta) }} · {{ alert.daysRemaining === 0 ? 'vence hoy' : alert.daysRemaining === 1 ? '1 día restante' : `${alert.daysRemaining} días restantes` }}</p>
          </li>
        </ul>
      </section>

      <ol class="mt-6 grid gap-4" aria-label="Materias de la trayectoria">
        <li v-for="item in trajectory.materias" :key="item.materia.id" class="rounded-lg border border-[var(--color-border)] bg-white p-5">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div><h2 class="text-lg font-semibold">{{ item.materia.nombre }}</h2><p class="mt-1 text-sm text-[var(--color-graphite)]">{{ item.plan?.anio ? `${item.plan.anio}.º año` : 'Año no informado' }}</p></div>
            <span class="rounded-full bg-[#f4e7e7] px-3 py-1 text-sm font-semibold text-[var(--color-brand)]">{{ academicLabel(item.estado) }}</span>
          </div>
          <div class="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <p v-if="item.asistencia">Asistencia: {{ item.asistencia.porcentaje ?? 0 }}%</p>
            <p v-if="item.regularidad">Regularidad: {{ item.regularidad.vencida ? 'Vencida' : `Vigente hasta ${formatAcademicDate(item.regularidad.hasta)}` }}</p>
            <p v-if="item.definitiva">Aprobación: {{ item.definitiva.nota }} ({{ academicLabel(item.definitiva.via) }})</p>
            <p v-if="item.parcialesEfectivos?.length">Notas: {{ item.parcialesEfectivos.map((partial) => partial.nota).filter((grade) => grade !== undefined).join(', ') }}</p>
          </div>
          <AppButton v-if="courseOptions(item).length" class="mt-4" variant="secondary" :aria-expanded="expanded === subjectKey(item)" :aria-controls="`attendance-${subjectKey(item)}`" @click="toggleAttendance(item)">{{ expanded === subjectKey(item) ? 'Ocultar asistencias' : 'Ver asistencias' }}</AppButton>
          <section v-if="expanded === subjectKey(item)" :id="`attendance-${subjectKey(item)}`" class="mt-4 border-t border-[var(--color-border)] pt-4" aria-live="polite">
            <label class="block text-sm font-semibold">Cursada
              <select class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-3 font-normal" :value="selectedCourse(item)?.cursadaId" @change="changeAttendanceCourse(item, $event)">
                <option v-for="course in courseOptions(item)" :key="course.cursadaId" :value="course.cursadaId">{{ course.anioLectivo }} · {{ academicLabel(course.periodo) }} · {{ course.asistencia?.porcentaje ?? 0 }}%</option>
              </select>
            </label>
            <p v-if="attendanceLoading" class="mt-3" role="status">Cargando asistencias…</p>
            <div v-else-if="attendanceError" class="mt-3" role="alert"><p>{{ attendanceError }}</p><AppButton class="mt-2" variant="secondary" @click="retryAttendance(item)">Reintentar</AppButton></div>
            <p v-else-if="!attendance.length" class="mt-3 text-sm text-[var(--color-graphite)]">No hay registros de asistencia.</p>
            <ul v-else class="mt-3 space-y-2 text-sm">
              <li v-for="row in attendance" :key="`${row.cursadaId}-${row.fecha}`" class="flex flex-wrap justify-between gap-2 rounded-md bg-[#f6f7f4] p-3"><span>{{ formatAcademicDate(row.fecha) }}</span><span>{{ row.presente ? 'Presente' : row.justificado ? 'Ausente · Justificada' : 'Ausente' }}</span></li>
            </ul>
            <nav v-if="!attendanceLoading && !attendanceError && attendancePagination.totalPages > 1" class="mt-3 flex items-center justify-between gap-3 text-sm" aria-label="Paginación de asistencias">
              <AppButton variant="secondary" :disabled="attendancePagination.page <= 1" @click="loadAttendance(item, selectedCourse(item)?.cursadaId ?? 0, attendancePagination.page - 1)">Anterior</AppButton>
              <span>Página {{ attendancePagination.page }} de {{ attendancePagination.totalPages }}</span>
              <AppButton variant="secondary" :disabled="attendancePagination.page >= attendancePagination.totalPages" @click="loadAttendance(item, selectedCourse(item)?.cursadaId ?? 0, attendancePagination.page + 1)">Siguiente</AppButton>
            </nav>
          </section>
        </li>
      </ol>
    </template>
  </main>
</template>
