<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AdminExamsList from '../components/ExamTableList.vue'
import ExamResultPanel from '../components/ExamResultPanel.vue'
import { closeExamTable, getExamWorkspace, listExamTables, reloadExamResults, saveExamResult } from '../api/examsApi'
import { useAuthStore } from '@/stores/authStore'
import { academicLabel } from '@/core/presentation/academicLabels'
import { examDateLabel } from '../presentation'
import { isTribunalComplete } from '../tribunalRules'
import type { ExamListItem, ExamResultsSnapshot, ExamWorkspace, ResultWriteInput, TribunalMember } from '../types/exams'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const isList = computed(() => String(route.name ?? 'teacher-exams') === 'teacher-exams')
const examId = computed(() => Number(route.params.id))
const exams = ref<ExamListItem[]>([])
const workspace = ref<ExamWorkspace | null>(null)
const pagination = ref({ page: 1, limit: 20, total: 0, totalPages: 0 })
const loading = ref(false)
const error = ref('')
const requestId = ref(0)

async function loadList(): Promise<void> {
  const current = ++requestId.value
  loading.value = true
  error.value = ''
  try {
    const result = await listExamTables({ page: Number(route.query.page ?? 1), limit: 20 })
    if (current !== requestId.value) return
    exams.value = result.data
    pagination.value = result.pagination
  } catch (cause) {
    if (current === requestId.value) error.value = cause && typeof cause === 'object' && 'status' in cause && (cause as { status?: number }).status === 403 ? 'No tenés permiso para consultar estas mesas.' : 'No pudimos cargar tus mesas de tribunal.'
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
      const status = cause && typeof cause === 'object' && 'status' in cause ? (cause as { status?: number }).status : undefined
      error.value = status === 403 || status === 404 ? 'Esta mesa no está asignada a tu tribunal.' : 'No pudimos cargar el detalle de la mesa.'
    }
  } finally {
    if (current === requestId.value) loading.value = false
  }
}

function changePage(page: number): void {
  void router.replace({ name: 'teacher-exams', query: { ...route.query, page: String(page) } })
}

function isPresident(): boolean {
  const userId = auth.user?.idUsuario
  return Boolean(userId && workspace.value?.detail.tribunales.some((member) => member.profesorId === userId && member.rolTribunal === 'PRESIDENTE'))
}

function tribunalComplete(members: TribunalMember[]): boolean {
  return isTribunalComplete(members)
}

function saveResult(input: ResultWriteInput) {
  return saveExamResult(examId.value, input)
}

async function reloadResults(): Promise<ExamResultsSnapshot> {
  const snapshot = await reloadExamResults(examId.value)
  if (workspace.value) workspace.value = { ...workspace.value, results: snapshot.results, detail: { ...workspace.value.detail, version: snapshot.version } }
  return snapshot
}

function onChanged(): void {
  void loadWorkspace()
}

watch(() => route.fullPath, () => { if (isList.value) void loadList(); else void loadWorkspace() })
onMounted(() => { if (isList.value) void loadList(); else void loadWorkspace() })
</script>

<template>
  <main aria-labelledby="teacher-exams-title" class="mx-auto max-w-6xl">
    <div><p class="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--color-brand)]">Espacio docente</p><h1 id="teacher-exams-title" class="mt-2 text-3xl font-semibold">Mis mesas de tribunal</h1><p class="mt-2 text-[var(--color-graphite)]">Cargá resultados sólo en las mesas donde participás y cerrá cuando seas presidente.</p></div>
    <template v-if="isList"><div class="mt-6"><AdminExamsList :exams="exams" :pagination="pagination" :loading="loading" :error="error" empty-text="No tenés mesas de tribunal asignadas." detail-route-name="teacher-exam-detail" @retry="loadList" @page="changePage" /></div></template>
    <template v-else><div class="mt-5"><RouterLink :to="{ name: 'teacher-exams', query: route.query }" class="font-semibold text-[var(--color-brand)]">← Volver a mis mesas</RouterLink></div><div v-if="loading" class="mt-5 rounded-xl border border-[var(--color-border)] bg-white p-10 text-center" role="status">Cargando mesa…</div><div v-else-if="error" class="mt-5 rounded-xl border border-red-200 bg-red-50 p-6 text-red-800" role="alert"><p>{{ error }}</p><button type="button" class="mt-3 min-h-10 rounded-md bg-[var(--color-brand)] px-4 font-semibold text-white" @click="loadWorkspace">Reintentar</button></div><template v-else-if="workspace"><section class="mt-5 rounded-xl border border-[var(--color-border)] bg-white p-5 sm:p-6"><p class="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--color-brand)]">Mesa de examen</p><h2 class="mt-2 text-2xl font-semibold">{{ workspace.detail.materia.nombre }}</h2><p class="mt-1 text-[var(--color-graphite)]">{{ examDateLabel(workspace.detail.fecha) }} · {{ academicLabel(workspace.detail.tipoExamen) }} · llamado {{ workspace.detail.llamado }}</p><p class="mt-2 text-sm text-[var(--color-graphite)]">Estado: <strong>{{ academicLabel(workspace.detail.estadoMesa) }}</strong></p><h3 class="mt-5 text-lg font-semibold">Tribunal</h3><ul class="mt-2 grid gap-2 sm:grid-cols-2"><li v-for="member in workspace.detail.tribunales" :key="member.id ?? `${member.profesorId}-${member.rolTribunal}`" class="rounded-lg bg-[#f6f7f4] p-3 text-sm"><strong>{{ academicLabel(member.rolTribunal) }}</strong> · {{ member.apellidoNombre }}</li></ul></section><ExamResultPanel :results="workspace.results" :version="workspace.detail.version" :status="workspace.detail.estadoMesa" :editable="workspace.detail.estadoMesa !== 'FINALIZADA'" :can-close="isPresident() && tribunalComplete(workspace.detail.tribunales)" :save-result="saveResult" :reload-results="reloadResults" :close-table="isPresident() ? (version) => closeExamTable(examId, version) : undefined" @changed="onChanged" /></template></template>
  </main>
</template>
