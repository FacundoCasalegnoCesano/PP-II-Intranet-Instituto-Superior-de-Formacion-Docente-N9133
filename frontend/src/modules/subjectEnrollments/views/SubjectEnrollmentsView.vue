<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { fetchAvailableSubjects, fetchMySubjectEnrollments, verifySubjectEnrollment, enrollInSubject, dropSubjectEnrollment } from '../api/subjectEnrollmentsApi'
import type { AvailableSubject, SubjectEnrollment, SubjectModality } from '../types/subjectEnrollments'
import { useAuthStore } from '@/stores/authStore'
import AppButton from '@/ui/AppButton.vue'
import ConfirmDialog from '@/ui/ConfirmDialog.vue'
import { academicLabel } from '@/core/presentation/academicLabels'

const auth = useAuthStore()
const year = ref(new Date().getFullYear())
const subjects = ref<AvailableSubject[]>([])
const enrollments = ref<SubjectEnrollment[]>([])
const loading = ref(false)
const error = ref('')
const actionError = ref('')
const pendingEnrollment = ref<AvailableSubject | null>(null)
const pendingDrop = ref<SubjectEnrollment | null>(null)
const saving = ref(false)

function selectedModality(subject: AvailableSubject): SubjectModality { return subject.modalidad ?? 'PRESENCIAL' }
function unavailableReason(subject: AvailableSubject): string | null { if (subject.yaAprobada) return 'Materia aprobada'; if (subject.yaInscripto) return 'Ya estás inscripto/a'; if (!subject.cumpleCorrelativas) return 'Correlativas pendientes'; if (!subject.habilitada) return 'Inscripción no habilitada'; return null }

async function load(): Promise<void> {
  if (!auth.user) return
  loading.value = true; error.value = ''
  try { [subjects.value, enrollments.value] = await Promise.all([fetchAvailableSubjects(year.value), fetchMySubjectEnrollments(auth.user.idUsuario)]) }
  catch { error.value = 'No pudimos cargar las materias disponibles.' }
  finally { loading.value = false }
}
async function verify(subject: AvailableSubject): Promise<void> {
  actionError.value = ''
  try {
    const verified = await verifySubjectEnrollment(subject.id, year.value)
    if (!verified.puedeInscribirse || !verified.materia.habilitada || verified.materia.yaInscripto || verified.materia.yaAprobada || !verified.materia.cumpleCorrelativas) { actionError.value = 'La institución informó que esta materia ya no está disponible para inscripción.'; await load(); return }
    pendingEnrollment.value = verified.materia
  } catch { actionError.value = 'No pudimos verificar esta inscripción.' }
}
async function confirmEnrollment(): Promise<void> {
  if (!pendingEnrollment.value) return
  saving.value = true; actionError.value = ''
  try { await enrollInSubject({ materiaId: pendingEnrollment.value.id, cicloLectivo: year.value, modalidadElegida: selectedModality(pendingEnrollment.value) }); pendingEnrollment.value = null; await load() }
  catch { actionError.value = 'No pudimos registrar la inscripción.' }
  finally { saving.value = false }
}
async function confirmDrop(): Promise<void> {
  if (!pendingDrop.value) return
  saving.value = true; actionError.value = ''
  try { await dropSubjectEnrollment(pendingDrop.value.id); pendingDrop.value = null; await load() }
  catch { actionError.value = 'No pudimos dar de baja la inscripción.' }
  finally { saving.value = false }
}
onMounted(() => { void load() })
</script>

<template>
  <main class="mx-auto max-w-6xl" aria-labelledby="subjects-title">
    <div class="flex flex-wrap items-end justify-between gap-4"><div><p class="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--color-brand)]">Autogestión académica</p><h1 id="subjects-title" class="mt-2 text-3xl font-semibold">Mis materias</h1><p class="mt-2 text-[var(--color-graphite)]">La disponibilidad y las correlatividades las confirma la institución.</p></div><a href="/app/horarios" class="min-h-11 rounded-md border border-[var(--color-brand)] px-4 py-2 font-semibold text-[var(--color-brand)]">Horarios oficiales</a></div>
    <label class="mt-6 block max-w-xs font-semibold">Ciclo lectivo<input v-model.number="year" type="number" min="2000" max="2100" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] px-3 font-normal" @change="load" /></label>
    <p v-if="actionError" class="mt-4 rounded-md border border-[#a31118]/30 bg-[#fff7f6] p-3" role="alert">{{ actionError }}</p>
    <section v-if="loading" class="mt-6 rounded-lg border border-[var(--color-border)] bg-white p-5" role="status">Cargando materias…</section><section v-else-if="error" class="mt-6 rounded-lg border border-[#a31118]/30 bg-[#fff7f6] p-5" role="alert"><p>{{ error }}</p><AppButton class="mt-4" variant="secondary" @click="load">Reintentar</AppButton></section><section v-else-if="!subjects.length" class="mt-6 rounded-lg border border-[var(--color-border)] bg-white p-5">No hay materias disponibles para este ciclo.</section>
    <ul v-else class="mt-6 grid gap-4" aria-label="Materias disponibles"><li v-for="subject in subjects" :key="subject.id" class="rounded-lg border border-[var(--color-border)] bg-white p-5"><div class="flex flex-wrap justify-between gap-3"><div><h2 class="text-xl font-semibold">{{ subject.nombre }}</h2><p class="mt-1 text-sm text-[var(--color-graphite)]">{{ subject.carreras?.map((career) => career.nombre).join(', ') || subject.carrera?.nombre }} · {{ subject.curso?.anio ? `${subject.curso.anio}.º año` : 'Año no informado' }}</p></div><span class="text-sm font-semibold">{{ unavailableReason(subject) ?? 'Disponible' }}</span></div><p class="mt-3 text-sm">Modalidad: {{ academicLabel(selectedModality(subject)) }}</p><p v-if="subject.correlativasPendientes.length" class="mt-2 text-sm">Correlativas pendientes: {{ subject.correlativasPendientes.map((item) => item.nombre).join(', ') }}</p><div class="mt-4"><AppButton :disabled="Boolean(unavailableReason(subject))" @click="verify(subject)">Verificar e inscribirme</AppButton></div></li></ul>
    <section v-if="enrollments.length" class="mt-8 rounded-lg border border-[var(--color-border)] bg-white p-5" aria-labelledby="enrollments-title"><h2 id="enrollments-title" class="text-xl font-semibold">Mis inscripciones activas</h2><ul class="mt-4 grid gap-3"><li v-for="enrollment in enrollments" :key="enrollment.id" class="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3"><span>{{ enrollment.materia?.nombre ?? `Materia #${enrollment.materiaId}` }} · {{ academicLabel(enrollment.modalidadElegida) }}</span><AppButton variant="secondary" @click="pendingDrop = enrollment">Dar de baja</AppButton></li></ul></section>
    <ConfirmDialog :open="Boolean(pendingEnrollment)" title="Confirmar inscripción" :description="`Vas a solicitar la inscripción a ${pendingEnrollment?.nombre ?? ''}.`" confirm-label="Inscribirme" :loading="saving" @cancel="pendingEnrollment = null" @confirm="confirmEnrollment" /><ConfirmDialog :open="Boolean(pendingDrop)" title="Confirmar baja" :description="`Vas a dar de baja ${pendingDrop?.materia?.nombre ?? 'esta inscripción'}.`" confirm-label="Dar de baja" :loading="saving" @cancel="pendingDrop = null" @confirm="confirmDrop" />
  </main>
</template>
