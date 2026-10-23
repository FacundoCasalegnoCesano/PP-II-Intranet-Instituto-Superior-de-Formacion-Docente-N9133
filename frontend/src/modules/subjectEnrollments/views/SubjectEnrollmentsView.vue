<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { fetchAvailableSubjects, fetchMySubjectEnrollments, verifySubjectEnrollment, enrollInSubject, dropSubjectEnrollment, fetchAvailableSpaceEnrollments, fetchMySpaceEnrollments, verifySpaceEnrollment, enrollInSpace, dropSpaceEnrollment } from '../api/subjectEnrollmentsApi'
import type { AvailableSubject, SubjectEnrollment, SubjectModality, SpaceEnrollment, SpaceEnrollmentOffer } from '../types/subjectEnrollments'
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
const institutionalYear = new Date().getFullYear()
const year = ref(new Date().getFullYear())
const careers = ref<StudentCareer[]>([])
const subjects = ref<AvailableSubject[]>([])
const enrollments = ref<SubjectEnrollment[]>([])
const spaceOffers = ref<SpaceEnrollmentOffer[]>([])
const spaceEnrollments = ref<SpaceEnrollment[]>([])
const enrollmentPage = ref<PaginationMeta>({ page: 1, limit: 20, total: 0, totalPages: 0 })
const enrollmentPageNumber = ref(1)
const loading = ref(false)
const error = ref('')
const actionError = ref('')
const actionSuccess = ref('')
const pendingEnrollment = ref<AvailableSubject | null>(null)
const pendingDrop = ref<SubjectEnrollment | null>(null)
const pendingSpace = ref<SpaceEnrollmentOffer | null>(null)
const pendingSpaceDrop = ref<SpaceEnrollment | null>(null)
const pendingEnrollmentCareerId = ref<number | null>(null)
const pendingEnrollmentYear = ref<number | null>(null)
const saving = ref(false)
let loadRequest = 0
let verifyRequest = 0
let mounted = true

function selectedModality(subject: AvailableSubject): SubjectModality { return subject.modalidad ?? 'PRESENCIAL' }
function isPastCycle(cycle: number): boolean { return cycle < institutionalYear }
function unavailableReason(subject: AvailableSubject): string | null { if (isPastCycle(year.value)) return 'Finalizada'; if (subject.yaAprobada) return 'Materia aprobada'; if (subject.yaInscripto) return 'Ya estás inscripto/a'; if (!subject.cumpleCorrelativas) return 'Correlativas pendientes'; if (!subject.habilitada) return 'Inscripción no habilitada'; return null }
function spaceUnavailableReason(offer: SpaceEnrollmentOffer): string { if (isPastCycle(offer.anioLectivo)) return 'Finalizada'; if (offer.aprobado) return 'Espacio aprobado'; if (offer.yaInscripto) return 'Ya estás inscripto/a'; if (offer.motivos.length) return offer.motivos.map((item) => item.mensaje).join(' · '); return offer.habilitada ? 'Disponible' : 'Inscripción no habilitada' }
function enrollmentStatus(enrollment: SubjectEnrollment): string { return isPastCycle(enrollment.cicloLectivo) ? 'Finalizada' : academicLabel(enrollment.estado) }
function backendMessage(cause: unknown, fallback: string): string { return cause instanceof Error && cause.message ? cause.message : fallback }
function identity() { return { userId: auth.user?.idUsuario ?? null, role: auth.activeRole ?? null } }
const selectedCareerId = computed(() => careerSelection.isOwnedBy(identity()) ? careerSelection.selectedCareerId : null)
const visibleSubjects = computed(() => selectedCareerId.value === null
  ? subjects.value.filter((subject) => !spaceComponentIds.value.has(subject.id))
  : subjects.value.filter((subject) => !spaceComponentIds.value.has(subject.id) && [subject.carrera?.id, ...(subject.carreras ?? []).map((career) => career.id)].includes(selectedCareerId.value as number)))
const activeSpaceEnrollments = computed(() => spaceEnrollments.value.filter((item) => item.estado === 'ACTIVA'))
const visibleSpaceOffers = computed(() => spaceOffers.value.filter((offer) => offer.anioLectivo === year.value && (selectedCareerId.value === null || offer.espacioCurricular.carreraId === selectedCareerId.value)))
const spaceComponentIds = computed(() => new Set([...spaceOffers.value.flatMap((offer) => offer.componentes.map((item) => item.materia.id)), ...activeSpaceEnrollments.value.flatMap((offer) => offer.componentes.map((item) => item.materia.id))]))
const selectedCareerName = computed(() => careers.value.find((career) => career.carreraId === selectedCareerId.value)?.carrera.nombre ?? 'Todas las carreras')
const careerSelectionValue = computed(() => selectedCareerId.value === null ? '' : String(selectedCareerId.value))
function validYear(value: number): boolean { return Number.isInteger(value) && value >= 2000 && value <= 2100 }
function invalidateAction(): void {
  ++verifyRequest
  pendingEnrollment.value = null
  pendingDrop.value = null
  pendingSpace.value = null
  pendingSpaceDrop.value = null
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
    subjects.value = []; spaceOffers.value = []; enrollments.value = []; spaceEnrollments.value = []; loading.value = false; error.value = 'Ingresá un ciclo lectivo válido entre 2000 y 2100.'
    return
  }
  if (refreshSubjects) { subjects.value = []; spaceOffers.value = [] }
  enrollments.value = []; loading.value = true; error.value = ''
  try {
    const [available, mine, availableSpaces, mineSpaces] = await Promise.all([
      refreshSubjects ? fetchAvailableSubjects(snapshot.year) : Promise.resolve(subjects.value),
      fetchMySubjectEnrollments(snapshot.userId, requestedPage),
      refreshSubjects ? fetchAvailableSpaceEnrollments(snapshot.year) : Promise.resolve(spaceOffers.value),
      fetchMySpaceEnrollments(),
    ])
    if (!mounted || request !== loadRequest || identity().userId !== snapshot.userId || identity().role !== snapshot.role || year.value !== snapshot.year) return
    const lastPage = Math.max(1, mine.pagination.totalPages)
    if (refreshSubjects) subjects.value = available
    if (refreshSubjects) spaceOffers.value = availableSpaces
    spaceEnrollments.value = mineSpaces.filter((item) => item.estado === 'ACTIVA')
    if (requestedPage > lastPage) {
      enrollmentPageNumber.value = lastPage
      await load(lastPage, false)
      return
    }
    enrollments.value = mine.data.filter(({ estado, inscripcionEspacioId }) => !inscripcionEspacioId && (estado === 'ACTIVA' || estado === 'RECURSANDO' || estado === 'FINALIZADA'))
    enrollmentPage.value = mine.pagination
  }
  catch { if (mounted && request === loadRequest && identity().userId === snapshot.userId && identity().role === snapshot.role && year.value === snapshot.year) error.value = 'No pudimos cargar las materias disponibles.' }
  finally { if (mounted && request === loadRequest) loading.value = false }
}
async function verify(subject: AvailableSubject): Promise<void> {
  const request = ++verifyRequest
  const snapshot = { ...identity(), year: year.value, careerId: selectedCareerId.value }
  if (snapshot.userId === null || snapshot.role !== 'ALUMNO' || isPastCycle(snapshot.year) || loading.value || saving.value) return
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
async function verifySpace(offer: SpaceEnrollmentOffer): Promise<void> {
  const request = ++verifyRequest; const snapshot = { ...identity(), year: year.value, careerId: selectedCareerId.value }
  if (snapshot.userId === null || snapshot.role !== 'ALUMNO' || isPastCycle(offer.anioLectivo) || loading.value || saving.value || offer.anioLectivo !== snapshot.year || (snapshot.careerId !== null && offer.espacioCurricular.carreraId !== snapshot.careerId) || !spaceOffers.value.some((item) => item.cursadaEspacioId === offer.cursadaEspacioId && item.anioLectivo === snapshot.year)) return
  actionError.value = ''
  try {
    const verified = await verifySpaceEnrollment(offer.cursadaEspacioId)
    if (!mounted || request !== verifyRequest || identity().userId !== snapshot.userId || identity().role !== snapshot.role || year.value !== snapshot.year || selectedCareerId.value !== snapshot.careerId) return
    if (!verified.habilitada || verified.yaInscripto || verified.aprobado || verified.motivos.length) { actionError.value = verified.motivos.map((item) => item.mensaje).join(' ') || 'Este espacio ya no está disponible para inscripción.'; await load(enrollmentPageNumber.value, true); return }
    pendingSpace.value = verified; pendingEnrollmentCareerId.value = snapshot.careerId; pendingEnrollmentYear.value = snapshot.year
  } catch (cause) { if (mounted && request === verifyRequest && identity().userId === snapshot.userId && identity().role === snapshot.role && year.value === snapshot.year && selectedCareerId.value === snapshot.careerId) actionError.value = backendMessage(cause, 'No pudimos verificar la inscripción al espacio curricular.') }
}
async function confirmSpaceEnrollment(): Promise<void> {
  const pending = pendingSpace.value; if (!pending || saving.value || loading.value || isPastCycle(pending.anioLectivo) || pending.anioLectivo !== year.value || (selectedCareerId.value !== null && pending.espacioCurricular.carreraId !== selectedCareerId.value) || !spaceOffers.value.some((item) => item.cursadaEspacioId === pending.cursadaEspacioId && item.anioLectivo === year.value)) { invalidateAction(); return }
  const owner = identity(); const careerId = selectedCareerId.value; const cycle = year.value
  if (pendingEnrollmentCareerId.value !== careerId || pendingEnrollmentYear.value !== cycle || owner.userId === null || owner.role !== 'ALUMNO') { invalidateAction(); return }
  saving.value = true; actionError.value = ''
  try { await enrollInSpace(pending.cursadaEspacioId); if (identity().userId === owner.userId && identity().role === owner.role && year.value === cycle && selectedCareerId.value === careerId) { pendingSpace.value = null; actionSuccess.value = `Te inscribiste al espacio ${pending.espacioCurricular.nombre}.`; await load(enrollmentPageNumber.value, true) } }
  catch (cause) { if (identity().userId === owner.userId && identity().role === owner.role && year.value === cycle && selectedCareerId.value === careerId) actionError.value = backendMessage(cause, 'No pudimos registrar la inscripción al espacio.') }
  finally { saving.value = false }
}
async function confirmSpaceDrop(): Promise<void> {
  const pending = pendingSpaceDrop.value; if (!pending || saving.value || loading.value) return
  const owner = identity(); saving.value = true; actionError.value = ''
  try { await dropSpaceEnrollment(pending.id); if (identity().userId === owner.userId && identity().role === owner.role) { pendingSpaceDrop.value = null; actionSuccess.value = `Diste de baja tu inscripción a ${pending.espacioCurricular.nombre}.`; await load(enrollmentPageNumber.value, true) } }
  catch (cause) { if (identity().userId === owner.userId && identity().role === owner.role) actionError.value = backendMessage(cause, 'No pudimos dar de baja el espacio curricular.') }
  finally { saving.value = false }
}
async function confirmEnrollment(): Promise<void> {
  if (!pendingEnrollment.value) return
  const careerId = selectedCareerId.value
  const pending = pendingEnrollment.value
  const owner = identity()
  const enrollmentYear = year.value
  if (careerId !== pendingEnrollmentCareerId.value || enrollmentYear !== pendingEnrollmentYear.value || isPastCycle(enrollmentYear) || owner.userId === null || owner.role !== 'ALUMNO') { invalidateAction(); return }
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
  spaceOffers.value = []
  spaceEnrollments.value = []
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
  subjects.value = []; spaceOffers.value = []; enrollments.value = []; error.value = ''
  void load()
})
watch(() => [auth.user?.idUsuario ?? null, auth.activeRole ?? null], ([userId, role], previous) => {
  if (userId !== previous[0] || role !== previous[1]) handleIdentityChange()
})
</script>

<template>
  <main class="mx-auto max-w-6xl" aria-labelledby="subjects-title">
    <div class="flex flex-wrap items-end justify-between gap-4"><div><p class="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--color-brand)]">Autogestión académica</p><h1 id="subjects-title" class="mt-2 text-3xl font-semibold">Mis materias y espacios curriculares</h1><p class="mt-2 text-[var(--color-graphite)]">La disponibilidad y las correlatividades las confirma la institución.</p></div><a href="/app/horarios" class="min-h-11 rounded-md border border-[var(--color-brand)] px-4 py-2 font-semibold text-[var(--color-brand)]">Horarios oficiales</a></div>
    <div class="mt-6 grid max-w-xl gap-4 sm:grid-cols-2">
      <label for="subject-year" class="block font-semibold">Ciclo lectivo<input id="subject-year" v-model.number="year" type="number" min="2000" max="2100" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] px-3 font-normal" /></label>
      <label for="subject-career" class="block font-semibold">Carrera
        <select id="subject-career" :value="careerSelectionValue" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] px-3 font-normal" @change="changeCareer">
          <option value="">Todas las carreras</option>
          <option v-for="career in careers" :key="career.id" :value="career.carreraId">{{ career.carrera.nombre }}</option>
        </select>
      </label>
    </div>
    <p class="mt-2 text-sm text-[var(--color-graphite)]">Oferta visible: {{ selectedCareerName }}. Las inscripciones se muestran para todas tus carreras; las de ciclos anteriores figuran como Finalizadas y quedan en modo consulta.</p>
    <p v-if="actionSuccess && !pendingEnrollment && !pendingDrop" class="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-900" role="status" aria-live="polite">{{ actionSuccess }}</p><p v-if="actionError && !pendingEnrollment && !pendingDrop" class="mt-4 rounded-md border border-[#a31118]/30 bg-[#fff7f6] p-3" role="alert" aria-live="assertive">{{ actionError }}</p>
    <section class="mt-6" aria-labelledby="space-offers-title"><h2 id="space-offers-title" class="text-2xl font-semibold">Espacios curriculares disponibles</h2><p v-if="!loading && !visibleSpaceOffers.length" class="mt-3 rounded-lg border border-[var(--color-border)] bg-white p-5">No hay espacios curriculares disponibles para {{ selectedCareerName }} en este ciclo.</p><ul v-else class="mt-4 grid min-w-0 max-w-full gap-4"><li v-for="offer in visibleSpaceOffers" :key="offer.cursadaEspacioId" class="min-w-0 max-w-full rounded-lg border border-[var(--color-border)] bg-white p-5"><div class="flex min-w-0 max-w-full flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between"><div class="min-w-0 w-full max-w-full flex-1"><h3 class="break-words text-xl font-semibold [overflow-wrap:anywhere]">{{ offer.espacioCurricular.nombre }}</h3><p class="mt-1 break-words text-sm text-[var(--color-graphite)] [overflow-wrap:anywhere]">{{ offer.espacioCurricular.carrera?.nombre }} · {{ offer.anioLectivo }} · {{ academicLabel(offer.periodo ?? 'ANUAL') }}</p></div><span class="min-w-0 w-full max-w-full break-words font-semibold [overflow-wrap:anywhere]">{{ spaceUnavailableReason(offer) }}</span></div><details class="mt-3 min-w-0 max-w-full"><summary class="min-h-10 cursor-pointer break-words font-semibold [overflow-wrap:anywhere]">Ver componentes ({{ offer.componentes.length }})</summary><ul class="mt-2 min-w-0 max-w-full list-inside list-disc break-words text-sm [overflow-wrap:anywhere]"><li v-for="component in offer.componentes" :key="component.cursadaId">{{ component.materia.nombre }} · {{ component.docente?.apellidoNombre ?? 'Docente sin asignar' }}<span v-if="component.yaCursada"> · Ya cursada</span><span v-if="component.estadoAcademico"> · {{ academicLabel(component.estadoAcademico) }}</span></li></ul></details><p v-if="offer.pendientes.length" class="mt-2 text-sm">Requisitos pendientes: {{ offer.pendientes.map((item) => item.nombre ?? '').filter(Boolean).join(', ') }}</p><div class="mt-4"><AppButton :disabled="loading || saving || isPastCycle(offer.anioLectivo) || offer.anioLectivo !== year || !offer.habilitada || offer.yaInscripto || offer.aprobado || Boolean(offer.motivos.length)" @click="verifySpace(offer)">Verificar e inscribirme al espacio</AppButton></div></li></ul></section>
    <section v-if="loading" class="mt-6 rounded-lg border border-[var(--color-border)] bg-white p-5" role="status">Cargando materias…</section><section v-else-if="error" class="mt-6 rounded-lg border border-[#a31118]/30 bg-[#fff7f6] p-5" role="alert"><p>{{ error }}</p><AppButton class="mt-4" variant="secondary" @click="() => load(enrollmentPageNumber, true)">Reintentar</AppButton></section><section v-else-if="!visibleSubjects.length" class="mt-6 rounded-lg border border-[var(--color-border)] bg-white p-5">No hay materias disponibles para {{ selectedCareerName }} en este ciclo.</section>
    <ul v-else class="mt-6 grid min-w-0 max-w-full grid-cols-1 gap-4" aria-label="Materias disponibles"><li v-for="subject in visibleSubjects" :key="subject.id" class="min-w-0 max-w-full rounded-lg border border-[var(--color-border)] bg-white p-5"><div class="flex min-w-0 max-w-full flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between"><div class="min-w-0 max-w-full flex-1"><h2 class="break-words text-xl font-semibold [overflow-wrap:anywhere]">{{ subject.nombre }}</h2><p class="mt-1 break-words text-sm text-[var(--color-graphite)] [overflow-wrap:anywhere]">{{ subject.carreras?.map((career) => career.nombre).join(', ') || subject.carrera?.nombre }} · {{ subject.curso?.anio ? `${subject.curso.anio}.º año` : 'Año no informado' }}</p></div><span class="min-w-0 max-w-full break-words text-sm font-semibold [overflow-wrap:anywhere]">{{ unavailableReason(subject) ?? 'Disponible' }}</span></div><p class="mt-3 text-sm">Modalidad: {{ academicLabel(selectedModality(subject)) }}</p><p v-if="subject.correlativasPendientes.length && !subject.yaAprobada && !subject.yaInscripto" class="mt-2 text-sm">Falta regularizar o aprobar: {{ subject.correlativasPendientes.map((item) => item.nombre).join(', ') }}</p><div class="mt-4"><AppButton :disabled="Boolean(unavailableReason(subject))" @click="verify(subject)">Verificar e inscribirme</AppButton></div></li></ul>
    <section class="mt-8 rounded-lg border border-[var(--color-border)] bg-white p-5" aria-labelledby="enrollments-title"><h2 id="enrollments-title" class="text-xl font-semibold">Mis inscripciones</h2><p class="mt-1 text-sm text-[var(--color-graphite)]" aria-live="polite">Las inscripciones a espacios se muestran como una sola unidad.</p><ul v-if="activeSpaceEnrollments.length" class="mt-4 grid min-w-0 max-w-full gap-3"><li v-for="enrollment in activeSpaceEnrollments" :key="`space-${enrollment.id}`" class="min-w-0 max-w-full border-t border-[var(--color-border)] pt-3"><div class="flex min-w-0 max-w-full flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between"><span class="min-w-0 w-full max-w-full flex-1 break-words [overflow-wrap:anywhere]"><strong>Espacio curricular · {{ enrollment.espacioCurricular.nombre }}</strong> · {{ enrollment.anioLectivo }} · {{ academicLabel(enrollment.periodo ?? 'ANUAL') }} · {{ isPastCycle(enrollment.anioLectivo) ? 'Finalizada' : academicLabel(enrollment.estado) }}</span><AppButton v-if="!isPastCycle(enrollment.anioLectivo)" class="w-full sm:w-auto" variant="secondary" :disabled="saving" @click="pendingSpaceDrop = enrollment">Dar de baja el espacio</AppButton></div><details class="mt-2 min-w-0 max-w-full"><summary class="cursor-pointer break-words text-sm font-semibold [overflow-wrap:anywhere]">Ver componentes ({{ enrollment.componentes.length }})</summary><ul class="min-w-0 max-w-full list-inside list-disc break-words text-sm [overflow-wrap:anywhere]"><li v-for="component in enrollment.componentes" :key="component.idInscripcionMateria">{{ component.materia.nombre }}<span v-if="component.yaCursada"> · Ya cursada</span><span v-if="component.estadoAcademico"> · {{ academicLabel(component.estadoAcademico) }}</span></li></ul></details></li></ul><p v-if="!loading && !error && !enrollments.length && !activeSpaceEnrollments.length" class="mt-4">No tenés inscripciones.</p><ul v-if="enrollments.length" class="mt-4 grid gap-3"><li v-for="enrollment in enrollments" :key="enrollment.id" class="flex flex-col items-stretch gap-3 border-t border-[var(--color-border)] pt-3 sm:flex-row sm:items-center sm:justify-between"><span class="min-w-0 w-full break-words [overflow-wrap:anywhere]">{{ enrollment.materia?.nombre ?? `Materia #${enrollment.materiaId}` }} · {{ academicLabel(enrollment.modalidadElegida) }} · {{ enrollment.cicloLectivo }} · {{ enrollmentStatus(enrollment) }}</span><AppButton v-if="!isPastCycle(enrollment.cicloLectivo)" class="w-full sm:w-auto" variant="secondary" :disabled="saving" @click="pendingDrop = enrollment">Dar de baja</AppButton></li></ul><AdminPagination v-if="!loading && !saving && !error" :pagination="enrollmentPage" @change="(page) => load(page, false)" /></section>
    <ConfirmDialog :open="Boolean(pendingEnrollment)" :error="actionError" title="Confirmar inscripción" :description="`Vas a solicitar la inscripción a ${pendingEnrollment?.nombre ?? ''}.`" confirm-label="Inscribirme" :loading="saving" @cancel="pendingEnrollment = null; actionError = ''; actionSuccess = ''" @confirm="confirmEnrollment" /><ConfirmDialog :open="Boolean(pendingDrop)" :error="actionError" title="Confirmar baja" :description="`Vas a dar de baja ${pendingDrop?.materia?.nombre ?? 'esta inscripción'}.`" confirm-label="Dar de baja" :loading="saving" @cancel="pendingDrop = null; actionError = ''; actionSuccess = ''" @confirm="confirmDrop" /><ConfirmDialog :open="Boolean(pendingSpace)" :error="actionError" title="Confirmar inscripción al espacio" :description="`Vas a solicitar la inscripción a ${pendingSpace?.espacioCurricular.nombre ?? ''} como una unidad, con todos sus componentes.`" confirm-label="Inscribirme al espacio" :loading="saving" @cancel="pendingSpace = null; actionError = ''; actionSuccess = ''" @confirm="confirmSpaceEnrollment" /><ConfirmDialog :open="Boolean(pendingSpaceDrop)" :error="actionError" title="Confirmar baja del espacio" :description="`Vas a dar de baja ${pendingSpaceDrop?.espacioCurricular.nombre ?? 'este espacio'} y sus componentes.`" confirm-label="Dar de baja el espacio" :loading="saving" @cancel="pendingSpaceDrop = null; actionError = ''; actionSuccess = ''" @confirm="confirmSpaceDrop" />
  </main>
</template>
