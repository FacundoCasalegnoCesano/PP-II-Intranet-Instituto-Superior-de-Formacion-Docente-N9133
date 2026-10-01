<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { fetchAvailableSubjects, fetchMySubjectEnrollments, verifySubjectEnrollment, enrollInSubject, dropSubjectEnrollment } from '../api/subjectEnrollmentsApi'
import type { AvailableSubject, SubjectEnrollment, SubjectModality } from '../types/subjectEnrollments'
import { useAuthStore } from '@/stores/authStore'
import { useCareerSelectionStore } from '@/stores/careerSelectionStore'
import { fetchStudentCareers } from '@/modules/home/api/homeApi'
import type { StudentCareer } from '@/modules/home/types/home'
import AppButton from '@/ui/AppButton.vue'
import ConfirmDialog from '@/ui/ConfirmDialog.vue'
import { academicLabel } from '@/core/presentation/academicLabels'
import type { PaginationMeta } from '@/core/api/contracts'
import AdminPagination from '@/modules/admin/components/AdminPagination.vue'

const auth = useAuthStore()
const careerSelection = useCareerSelectionStore()
const year = ref(new Date().getFullYear())
const careers = ref<StudentCareer[]>([])
const subjects = ref<AvailableSubject[]>([])
const enrollments = ref<SubjectEnrollment[]>([])
const enrollmentPage = ref<PaginationMeta>({ page: 1, limit: 20, total: 0, totalPages: 0 })
const enrollmentPageNumber = ref(1)
const loading = ref(false)
const error = ref('')
const actionError = ref('')
const actionSuccess = ref('')
const pendingEnrollment = ref<AvailableSubject | null>(null)
const pendingDrop = ref<SubjectEnrollment | null>(null)
const pendingEnrollmentCareerId = ref<number | null>(null)
const pendingEnrollmentYear = ref<number | null>(null)
const saving = ref(false)
let loadRequest = 0
let verifyRequest = 0
let mounted = true

function selectedModality(subject: AvailableSubject): SubjectModality { return subject.modalidad ?? 'PRESENCIAL' }
function unavailableReason(subject: AvailableSubject): string | null { if (subject.yaAprobada) return 'Materia aprobada'; if (subject.yaInscripto) return 'Ya estás inscripto/a'; if (!subject.cumpleCorrelativas) return 'Correlativas pendientes'; if (!subject.habilitada) return 'Inscripción no habilitada'; return null }
function backendMessage(cause: unknown, fallback: string): string { return cause instanceof Error && cause.message ? cause.message : fallback }
function identity() { return { userId: auth.user?.idUsuario ?? null, role: auth.activeRole ?? null } }
const selectedCareerId = computed(() => careerSelection.isOwnedBy(identity()) ? careerSelection.selectedCareerId : null)
const visibleSubjects = computed(() => selectedCareerId.value === null
  ? subjects.value
  : subjects.value.filter((subject) => [subject.carrera?.id, ...(subject.carreras ?? []).map((career) => career.id)].includes(selectedCareerId.value as number)))
const selectedCareerName = computed(() => careers.value.find((career) => career.carreraId === selectedCareerId.value)?.carrera.nombre ?? 'Todas las carreras')
const careerSelectionValue = computed(() => selectedCareerId.value === null ? '' : String(selectedCareerId.value))
function validYear(value: number): boolean { return Number.isInteger(value) && value >= 2000 && value <= 2100 }
function invalidateAction(): void {
  ++verifyRequest
  pendingEnrollment.value = null
  pendingDrop.value = null
  pendingEnrollmentCareerId.value = null
  pendingEnrollmentYear.value = null
  actionError.value = ''
  actionSuccess.value = ''
}

async function load(requestedPage = enrollmentPageNumber.value, refreshSubjects = requestedPage === 1): Promise<void> {
  const snapshot = { ...identity(), year: year.value }
  if (snapshot.userId === null || snapshot.role !== 'ALUMNO') return
  const request = ++loadRequest
  enrollmentPageNumber.value = requestedPage
  if (!validYear(snapshot.year)) {
    subjects.value = []; enrollments.value = []; loading.value = false; error.value = 'Ingresá un ciclo lectivo válido entre 2000 y 2100.'
    return
  }
  if (refreshSubjects) subjects.value = []
  enrollments.value = []; loading.value = true; error.value = ''
  try {
    const [available, mine] = await Promise.all([
      refreshSubjects ? fetchAvailableSubjects(snapshot.year) : Promise.resolve(subjects.value),
      fetchMySubjectEnrollments(snapshot.userId, requestedPage),
    ])
    if (!mounted || request !== loadRequest || identity().userId !== snapshot.userId || identity().role !== snapshot.role || year.value !== snapshot.year) return
    const lastPage = Math.max(1, mine.pagination.totalPages)
    if (refreshSubjects) subjects.value = available
    if (requestedPage > lastPage) {
      enrollmentPageNumber.value = lastPage
      await load(lastPage, false)
      return
    }
    enrollments.value = mine.data.filter(({ estado }) => estado === 'ACTIVA' || estado === 'RECURSANDO')
    enrollmentPage.value = mine.pagination
  }
  catch { if (mounted && request === loadRequest && identity().userId === snapshot.userId && identity().role === snapshot.role && year.value === snapshot.year) error.value = 'No pudimos cargar las materias disponibles.' }
  finally { if (mounted && request === loadRequest) loading.value = false }
}
async function verify(subject: AvailableSubject): Promise<void> {
  const request = ++verifyRequest
  const snapshot = { ...identity(), year: year.value, careerId: selectedCareerId.value }
  if (snapshot.userId === null || snapshot.role !== 'ALUMNO') return
  actionError.value = ''
  try {
    const verified = await verifySubjectEnrollment(subject.id, year.value)
    if (!mounted || request !== verifyRequest || identity().userId !== snapshot.userId || identity().role !== snapshot.role || year.value !== snapshot.year || selectedCareerId.value !== snapshot.careerId) return
    if (!verified.puedeInscribirse || !verified.materia.habilitada || verified.materia.yaInscripto || verified.materia.yaAprobada || !verified.materia.cumpleCorrelativas) { actionError.value = 'La institución informó que esta materia ya no está disponible para inscripción.'; await load(enrollmentPageNumber.value, true); return }
    actionError.value = ''
    pendingEnrollment.value = verified.materia
    pendingEnrollmentCareerId.value = snapshot.careerId
    pendingEnrollmentYear.value = snapshot.year
  } catch (cause) {
    if (mounted && request === verifyRequest && identity().userId === snapshot.userId && identity().role === snapshot.role && year.value === snapshot.year && selectedCareerId.value === snapshot.careerId) actionError.value = backendMessage(cause, 'No pudimos verificar esta inscripción.')
  }
}
async function confirmEnrollment(): Promise<void> {
  if (!pendingEnrollment.value) return
  const careerId = selectedCareerId.value
  const pending = pendingEnrollment.value
  const owner = identity()
  const enrollmentYear = year.value
  if (careerId !== pendingEnrollmentCareerId.value || enrollmentYear !== pendingEnrollmentYear.value || owner.userId === null || owner.role !== 'ALUMNO') { invalidateAction(); return }
  saving.value = true; actionError.value = ''
  try {
    await enrollInSubject({ materiaId: pending.id, cicloLectivo: enrollmentYear, modalidadElegida: selectedModality(pending) })
    if (careerId === selectedCareerId.value && enrollmentYear === year.value && identity().userId === owner.userId && identity().role === owner.role) {
      pendingEnrollment.value = null
      pendingEnrollmentCareerId.value = null
      pendingEnrollmentYear.value = null
      actionError.value = ''
      actionSuccess.value = `Te inscribiste a ${pending.nombre}.`
      await load(enrollmentPageNumber.value, true)
    }
  }
  catch (cause) {
    if (identity().userId === owner.userId && identity().role === owner.role && year.value === enrollmentYear && selectedCareerId.value === careerId) actionError.value = backendMessage(cause, 'No pudimos registrar la inscripción.')
  }
  finally { saving.value = false }
}
function changeCareer(event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLSelectElement)) return
  invalidateAction()
  pendingDrop.value = null
  actionError.value = ''
  actionSuccess.value = ''
  const careerId = Number(target.value)
  if (!Number.isInteger(careerId) || careerId < 1) careerSelection.clear()
  else {
    const career = careers.value.find((item) => item.carreraId === careerId)
    if (career) careerSelection.selectCareer(careerId, identity())
  }
}
function handleIdentityChange(): void {
  ++loadRequest
  enrollmentPageNumber.value = 1
  enrollmentPage.value = { page: 1, limit: 20, total: 0, totalPages: 0 }
  invalidateAction()
  pendingDrop.value = null
  careers.value = []
  subjects.value = []
  enrollments.value = []
  loading.value = false
  error.value = ''
  void Promise.all([load(), loadCareers()])
}
onMounted(() => { void Promise.all([load(), loadCareers()]) })
async function loadCareers(): Promise<void> {
  const snapshot = identity()
  if (snapshot.userId === null || snapshot.role !== 'ALUMNO') return
  try {
    const result = (await fetchStudentCareers(snapshot.userId)).filter(({ activo, carrera }) => activo !== false && carrera.activo !== false)
    if (!mounted || identity().userId !== snapshot.userId || identity().role !== snapshot.role) return
    careers.value = result
    if (selectedCareerId.value !== null && !result.some((career) => career.carreraId === selectedCareerId.value)) careerSelection.clear()
  } catch {
    if (mounted && identity().userId === snapshot.userId && identity().role === snapshot.role) careers.value = []
  }
}
onUnmounted(() => { mounted = false; loadRequest++; verifyRequest++ })
async function confirmDrop(): Promise<void> {
  if (!pendingDrop.value) return
  const pending = pendingDrop.value
  const owner = identity()
  saving.value = true; actionError.value = ''
  try {
    await dropSubjectEnrollment(pending.id)
    if (identity().userId === owner.userId && identity().role === owner.role) {
      pendingDrop.value = null
      actionError.value = ''
      actionSuccess.value = `Diste de baja tu inscripción a ${pending.materia?.nombre ?? 'la materia'}.`
      await load(enrollmentPageNumber.value, true)
    }
  }
  catch (cause) {
    if (identity().userId === owner.userId && identity().role === owner.role) actionError.value = backendMessage(cause, 'No pudimos dar de baja la inscripción.')
  }
  finally { saving.value = false }
}
watch(selectedCareerId, () => invalidateAction())
watch(year, (value, previous) => {
  if (value === previous) return
  enrollmentPageNumber.value = 1
  invalidateAction()
  subjects.value = []; enrollments.value = []; error.value = ''
  void load()
})
watch(() => [auth.user?.idUsuario ?? null, auth.activeRole ?? null], ([userId, role], previous) => {
  if (userId !== previous[0] || role !== previous[1]) handleIdentityChange()
})
</script>

<template>
  <main class="mx-auto max-w-6xl" aria-labelledby="subjects-title">
    <div class="flex flex-wrap items-end justify-between gap-4"><div><p class="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--color-brand)]">Autogestión académica</p><h1 id="subjects-title" class="mt-2 text-3xl font-semibold">Mis materias</h1><p class="mt-2 text-[var(--color-graphite)]">La disponibilidad y las correlatividades las confirma la institución.</p></div><a href="/app/horarios" class="min-h-11 rounded-md border border-[var(--color-brand)] px-4 py-2 font-semibold text-[var(--color-brand)]">Horarios oficiales</a></div>
    <div class="mt-6 grid max-w-xl gap-4 sm:grid-cols-2">
      <label for="subject-year" class="block font-semibold">Ciclo lectivo<input id="subject-year" v-model.number="year" type="number" min="2000" max="2100" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] px-3 font-normal" /></label>
      <label for="subject-career" class="block font-semibold">Carrera
        <select id="subject-career" :value="careerSelectionValue" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] px-3 font-normal" @change="changeCareer">
          <option value="">Todas las carreras</option>
          <option v-for="career in careers" :key="career.id" :value="career.carreraId">{{ career.carrera.nombre }}</option>
        </select>
      </label>
    </div>
    <p class="mt-2 text-sm text-[var(--color-graphite)]">Oferta visible: {{ selectedCareerName }}. Las inscripciones activas se muestran para todas tus carreras.</p>
    <p v-if="actionSuccess && !pendingEnrollment && !pendingDrop" class="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-900" role="status" aria-live="polite">{{ actionSuccess }}</p><p v-if="actionError && !pendingEnrollment && !pendingDrop" class="mt-4 rounded-md border border-[#a31118]/30 bg-[#fff7f6] p-3" role="alert" aria-live="assertive">{{ actionError }}</p>
    <section v-if="loading" class="mt-6 rounded-lg border border-[var(--color-border)] bg-white p-5" role="status">Cargando materias…</section><section v-else-if="error" class="mt-6 rounded-lg border border-[#a31118]/30 bg-[#fff7f6] p-5" role="alert"><p>{{ error }}</p><AppButton class="mt-4" variant="secondary" @click="() => load(enrollmentPageNumber, true)">Reintentar</AppButton></section><section v-else-if="!visibleSubjects.length" class="mt-6 rounded-lg border border-[var(--color-border)] bg-white p-5">No hay materias disponibles para {{ selectedCareerName }} en este ciclo.</section>
    <ul v-else class="mt-6 grid gap-4" aria-label="Materias disponibles"><li v-for="subject in visibleSubjects" :key="subject.id" class="rounded-lg border border-[var(--color-border)] bg-white p-5"><div class="flex flex-wrap justify-between gap-3"><div><h2 class="text-xl font-semibold">{{ subject.nombre }}</h2><p class="mt-1 text-sm text-[var(--color-graphite)]">{{ subject.carreras?.map((career) => career.nombre).join(', ') || subject.carrera?.nombre }} · {{ subject.curso?.anio ? `${subject.curso.anio}.º año` : 'Año no informado' }}</p></div><span class="text-sm font-semibold">{{ unavailableReason(subject) ?? 'Disponible' }}</span></div><p class="mt-3 text-sm">Modalidad: {{ academicLabel(selectedModality(subject)) }}</p><p v-if="subject.correlativasPendientes.length && !subject.yaAprobada && !subject.yaInscripto" class="mt-2 text-sm">Falta regularizar o aprobar: {{ subject.correlativasPendientes.map((item) => item.nombre).join(', ') }}</p><div class="mt-4"><AppButton :disabled="Boolean(unavailableReason(subject))" @click="verify(subject)">Verificar e inscribirme</AppButton></div></li></ul>
    <section class="mt-8 rounded-lg border border-[var(--color-border)] bg-white p-5" aria-labelledby="enrollments-title"><h2 id="enrollments-title" class="text-xl font-semibold">Mis inscripciones activas</h2><p class="mt-1 text-sm text-[var(--color-graphite)]" aria-live="polite">{{ enrollmentPage.total }} inscripciones activas en todas tus carreras.</p><p v-if="!loading && !error && !enrollments.length" class="mt-4">No tenés inscripciones activas.</p><ul v-else-if="enrollments.length" class="mt-4 grid gap-3"><li v-for="enrollment in enrollments" :key="enrollment.id" class="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3"><span>{{ enrollment.materia?.nombre ?? `Materia #${enrollment.materiaId}` }} · {{ academicLabel(enrollment.modalidadElegida) }} · {{ enrollment.cicloLectivo }} · {{ academicLabel(enrollment.estado) }}</span><AppButton variant="secondary" :disabled="saving" @click="pendingDrop = enrollment">Dar de baja</AppButton></li></ul><AdminPagination v-if="!loading && !saving && !error" :pagination="enrollmentPage" @change="(page) => load(page, false)" /></section>
    <ConfirmDialog :open="Boolean(pendingEnrollment)" :error="actionError" title="Confirmar inscripción" :description="`Vas a solicitar la inscripción a ${pendingEnrollment?.nombre ?? ''}.`" confirm-label="Inscribirme" :loading="saving" @cancel="pendingEnrollment = null; actionError = ''; actionSuccess = ''" @confirm="confirmEnrollment" /><ConfirmDialog :open="Boolean(pendingDrop)" :error="actionError" title="Confirmar baja" :description="`Vas a dar de baja ${pendingDrop?.materia?.nombre ?? 'esta inscripción'}.`" confirm-label="Dar de baja" :loading="saving" @cancel="pendingDrop = null; actionError = ''; actionSuccess = ''" @confirm="confirmDrop" />
  </main>
</template>
