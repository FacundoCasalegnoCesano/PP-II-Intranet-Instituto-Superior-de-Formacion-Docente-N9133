<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { enrollInExam, fetchAvailableExams, fetchMyExamEnrollments, withdrawFromExam } from '../api/examsApi'
import type { AvailableExam, ExamEnrollment } from '../types/exams'
import { useAuthStore } from '@/stores/authStore'
import AppButton from '@/ui/AppButton.vue'
import ConfirmDialog from '@/ui/ConfirmDialog.vue'
import { academicLabel, roleLabel } from '@/core/presentation/academicLabels'

const auth = useAuthStore()
const exams = ref<AvailableExam[]>([])
const enrollments = ref<ExamEnrollment[]>([])
const loading = ref(false)
const error = ref('')
const actionError = ref('')
const pendingWithdrawal = ref<AvailableExam | null>(null)
const saving = ref(false)
let disposed = false
let loadGeneration = 0

function formattedDate(value: string): string {
  return new Date(value).toLocaleString('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

function isCurrent(generation: number): boolean { return !disposed && generation === loadGeneration }

function statusText(status: ExamEnrollment['estadoResultado']): string {
  return { PENDIENTE: 'Pendiente', EN_REVISION: 'En revisión', AUSENTE: 'Ausente', CALIFICADO: 'Calificado' }[status]
}

function resultText(enrollment: ExamEnrollment): string {
  if (enrollment.estadoResultado === 'AUSENTE') return 'Ausente, sin nota'
  if (enrollment.estadoResultado === 'EN_REVISION') return 'Resultado en revisión'
  if (enrollment.estadoResultado === 'CALIFICADO' && enrollment.aprobado !== null) return enrollment.aprobado ? 'Aprobado' : 'Desaprobado'
  return 'Resultado pendiente'
}

async function load(): Promise<void> {
  const user = auth.user
  if (!user || auth.activeRole !== 'ALUMNO') return
  const generation = ++loadGeneration
  loading.value = true
  error.value = ''
  try {
    const [available, mine] = await Promise.all([fetchAvailableExams(), fetchMyExamEnrollments(user.idUsuario)])
    if (!isCurrent(generation)) return
    exams.value = available
    enrollments.value = mine
  } catch (cause) {
    if (!isCurrent(generation)) return
    error.value = cause && typeof cause === 'object' && 'status' in cause && (cause as { status?: number }).status === 403
      ? 'No tenés permiso para consultar tus mesas de examen.'
      : 'No pudimos cargar las mesas de examen.'
  } finally {
    if (isCurrent(generation)) loading.value = false
  }
}

async function enroll(exam: AvailableExam): Promise<void> {
  saving.value = true
  actionError.value = ''
  try {
    await enrollInExam(exam.id, exam.condicion, exam.version)
    await load()
  } catch {
    if (!disposed) actionError.value = 'No pudimos registrar la inscripción a la mesa.'
  } finally {
    if (!disposed) saving.value = false
  }
}

async function withdraw(): Promise<void> {
  if (!pendingWithdrawal.value) return
  const exam = pendingWithdrawal.value
  saving.value = true
  actionError.value = ''
  try {
    await withdrawFromExam(exam.id, exam.version)
    if (!disposed) pendingWithdrawal.value = null
    await load()
  } catch {
    if (!disposed) actionError.value = 'No pudimos dar de baja la inscripción a la mesa.'
  } finally {
    if (!disposed) saving.value = false
  }
}

watch(() => [auth.activeRole, auth.user?.idUsuario ?? null], ([role, userId]) => {
  ++loadGeneration
  exams.value = []
  enrollments.value = []
  loading.value = false
  error.value = ''
  actionError.value = ''
  pendingWithdrawal.value = null
  saving.value = false
  if (role === 'ALUMNO' && userId !== null) void load()
}, { immediate: true })
onBeforeUnmount(() => { disposed = true; ++loadGeneration })
</script>

<template>
  <main class="mx-auto max-w-6xl" aria-labelledby="exams-title"><p class="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--color-brand)]">Autogestión académica</p><h1 id="exams-title" class="mt-2 text-3xl font-semibold">Mis exámenes</h1><p class="mt-2 text-[var(--color-graphite)]">Las mesas, condiciones y períodos se informan desde la institución.</p><p v-if="actionError" class="mt-4 rounded-md border border-[#a31118]/30 bg-[#fff7f6] p-3" role="alert">{{ actionError }}</p><section v-if="loading" class="mt-7 rounded-lg border border-[var(--color-border)] bg-white p-5" role="status">Cargando mesas de examen…</section><section v-else-if="error" class="mt-7 rounded-lg border border-[#a31118]/30 bg-[#fff7f6] p-5" role="alert"><p>{{ error }}</p><AppButton class="mt-4" variant="secondary" @click="load">Reintentar</AppButton></section><section v-else-if="!exams.length" class="mt-7 rounded-lg border border-[var(--color-border)] bg-white p-5">No hay mesas habilitadas para inscribirte.</section><ul v-else class="mt-7 grid gap-4" aria-label="Mesas disponibles"><li v-for="exam in exams" :key="exam.id" class="rounded-lg border border-[var(--color-border)] bg-white p-5"><div class="flex flex-wrap items-start justify-between gap-3"><div><h2 class="text-xl font-semibold">{{ exam.materia.nombre }}</h2><p class="mt-1 text-sm text-[var(--color-graphite)]">{{ exam.materia.carrera.nombre }} · {{ formattedDate(exam.fecha) }} · {{ academicLabel(exam.tipoExamen) }} · Llamado {{ exam.llamado }}</p></div><span class="rounded-full bg-[#f4e7e7] px-3 py-1 text-sm font-semibold text-[var(--color-brand)]">Condición: {{ academicLabel(exam.condicion) }}</span></div><p class="mt-4 text-sm"><span class="font-semibold">Tribunal:</span> {{ exam.tribunal.map((member) => `${member.apellidoNombre} (${roleLabel(member.rolTribunal)})`).join(', ') || 'Sin tribunal informado' }}</p><AppButton class="mt-5" :disabled="saving" @click="exam.inscripto ? pendingWithdrawal = exam : enroll(exam)">{{ exam.inscripto ? 'Dar de baja' : 'Inscribirme' }}</AppButton></li></ul><section v-if="enrollments.length" class="mt-8" aria-labelledby="my-results-title"><h2 id="my-results-title" class="text-xl font-semibold">Mis inscripciones</h2><ul class="mt-4 grid gap-4"><li v-for="enrollment in enrollments" :key="enrollment.id" class="rounded-lg border border-[var(--color-border)] bg-white p-5"><div class="flex flex-wrap items-start justify-between gap-3"><div><h3 class="font-semibold">{{ enrollment.materia.nombre }}</h3><p class="mt-1 text-sm text-[var(--color-graphite)]">{{ formattedDate(enrollment.fecha) }} · Condición: {{ academicLabel(enrollment.condicion) }}</p></div><span class="rounded-full bg-[#f4e7e7] px-3 py-1 text-sm font-semibold text-[var(--color-brand)]">{{ statusText(enrollment.estadoResultado) }}</span></div><p v-if="enrollment.estadoResultado === 'CALIFICADO' && enrollment.nota !== null" class="mt-4 text-sm">Nota: {{ enrollment.nota }}</p><p class="mt-1 text-sm font-semibold">{{ resultText(enrollment) }}</p></li></ul></section><ConfirmDialog :open="Boolean(pendingWithdrawal)" title="Confirmar baja de examen" :description="`Vas a dar de baja la inscripción a ${pendingWithdrawal?.materia.nombre ?? ''}.`" confirm-label="Dar de baja" :loading="saving" @cancel="pendingWithdrawal = null" @confirm="withdraw" /></main>
</template>
