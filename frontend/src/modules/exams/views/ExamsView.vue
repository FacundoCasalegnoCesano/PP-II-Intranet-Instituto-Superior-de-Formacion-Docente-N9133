<script setup lang="ts">
import { onMounted, ref } from 'vue'
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

function formattedDate(value: string): string { return new Date(value).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' }) }
async function load(): Promise<void> { if (!auth.user) return; loading.value = true; error.value = ''; try { [exams.value, enrollments.value] = await Promise.all([fetchAvailableExams(), fetchMyExamEnrollments(auth.user.idUsuario)]) } catch { error.value = 'No pudimos cargar las mesas de examen.' } finally { loading.value = false } }
async function enroll(exam: AvailableExam): Promise<void> { saving.value = true; actionError.value = ''; try { await enrollInExam(exam.id, exam.condicion); await load() } catch { actionError.value = 'No pudimos registrar la inscripción a la mesa.' } finally { saving.value = false } }
async function withdraw(): Promise<void> { if (!pendingWithdrawal.value) return; saving.value = true; actionError.value = ''; try { await withdrawFromExam(pendingWithdrawal.value.id); pendingWithdrawal.value = null; await load() } catch { actionError.value = 'No pudimos dar de baja la inscripción a la mesa.' } finally { saving.value = false } }
onMounted(() => { void load() })
</script>

<template>
  <main class="mx-auto max-w-6xl" aria-labelledby="exams-title"><p class="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--color-brand)]">Autogestión académica</p><h1 id="exams-title" class="mt-2 text-3xl font-semibold">Mis exámenes</h1><p class="mt-2 text-[var(--color-graphite)]">Las mesas, condiciones y períodos se informan desde la institución.</p><p v-if="actionError" class="mt-4 rounded-md border border-[#a31118]/30 bg-[#fff7f6] p-3" role="alert">{{ actionError }}</p><section v-if="loading" class="mt-7 rounded-lg border border-[var(--color-border)] bg-white p-5" role="status">Cargando mesas de examen…</section><section v-else-if="error" class="mt-7 rounded-lg border border-[#a31118]/30 bg-[#fff7f6] p-5" role="alert"><p>{{ error }}</p><AppButton class="mt-4" variant="secondary" @click="load">Reintentar</AppButton></section><section v-else-if="!exams.length" class="mt-7 rounded-lg border border-[var(--color-border)] bg-white p-5">No hay mesas habilitadas para inscribirte.</section><ul v-else class="mt-7 grid gap-4" aria-label="Mesas disponibles"><li v-for="exam in exams" :key="exam.id" class="rounded-lg border border-[var(--color-border)] bg-white p-5"><div class="flex flex-wrap items-start justify-between gap-3"><div><h2 class="text-xl font-semibold">{{ exam.materia.nombre }}</h2><p class="mt-1 text-sm text-[var(--color-graphite)]">{{ exam.materia.carrera.nombre }} · {{ formattedDate(exam.fecha) }} · {{ academicLabel(exam.tipoExamen) }} · Llamado {{ exam.llamado }}</p></div><span class="rounded-full bg-[#f4e7e7] px-3 py-1 text-sm font-semibold text-[var(--color-brand)]">Condición: {{ academicLabel(exam.condicion) }}</span></div><p class="mt-4 text-sm"><span class="font-semibold">Tribunal:</span> {{ exam.tribunal.map((member) => `${member.apellidoNombre} (${roleLabel(member.rolTribunal)})`).join(', ') || 'Sin tribunal informado' }}</p><AppButton class="mt-5" :disabled="saving" @click="exam.inscripto ? pendingWithdrawal = exam : enroll(exam)">{{ exam.inscripto ? 'Dar de baja' : 'Inscribirme' }}</AppButton></li></ul><section v-if="enrollments.length" class="mt-8 text-sm text-[var(--color-graphite)]">Tenés {{ enrollments.length }} inscripción/es activa/s a mesas.</section><ConfirmDialog :open="Boolean(pendingWithdrawal)" title="Confirmar baja de examen" :description="`Vas a dar de baja la inscripción a ${pendingWithdrawal?.materia.nombre ?? ''}.`" confirm-label="Dar de baja" :loading="saving" @cancel="pendingWithdrawal = null" @confirm="withdraw" /></main>
</template>
