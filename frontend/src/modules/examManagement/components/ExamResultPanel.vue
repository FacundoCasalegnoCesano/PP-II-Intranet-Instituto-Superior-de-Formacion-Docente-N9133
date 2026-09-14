<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { academicLabel } from '@/core/presentation/academicLabels'
import type {
  ExamResultsSnapshot,
  ExamTableStatus,
  ExamWriteResponse,
  InscriptoResultado,
  ResultWriteInput,
} from '../types/exams'

interface DraftRow {
  nota: string
  ausente: boolean
  dirty: boolean
}

interface Props {
  results: InscriptoResultado[]
  version: number
  status: ExamTableStatus
  saveResult: (input: ResultWriteInput) => Promise<ExamWriteResponse>
  reloadResults: () => Promise<ExamResultsSnapshot>
  closeTable?: (expectedVersion: number) => Promise<ExamWriteResponse>
  reopenTable?: (motivo: string, expectedVersion: number) => Promise<ExamWriteResponse>
  editable?: boolean
  canClose?: boolean
  canReopen?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  editable: true,
  canClose: false,
  canReopen: false,
})

const emit = defineEmits<{
  changed: []
}>()

const localResults = ref<InscriptoResultado[]>([])
const drafts = ref<Record<number, DraftRow>>({})
const currentVersion = ref(props.version)
const savingId = ref<number | null>(null)
const tableSaving = ref(false)
const panelError = ref('')
const rowErrors = ref<Record<number, string>>({})
const reopenReason = ref('')
const closeConfirmationOpen = ref(false)
const closeCancelButton = ref<HTMLButtonElement | null>(null)

const readOnly = computed(() => !props.editable || props.status === 'FINALIZADA')
const pendingCount = computed(() => localResults.value.filter((row) => row.resultado === 'PENDIENTE').length)
const qualifiedCount = computed(() => localResults.value.filter((row) => row.resultado === 'CALIFICADO').length)
const absentCount = computed(() => localResults.value.filter((row) => row.resultado === 'AUSENTE').length)
const canPublish = computed(() => props.canClose && !readOnly.value && pendingCount.value === 0)

watch(closeConfirmationOpen, (open) => {
  if (open) void nextTick(() => closeCancelButton.value?.focus())
})

function draftFromResult(row: InscriptoResultado): DraftRow {
  return {
    nota: row.ausente || row.nota === null ? '' : String(row.nota),
    ausente: row.ausente,
    dirty: false,
  }
}

function syncResults(results: InscriptoResultado[], preserveDirty = true): void {
  localResults.value = results
  const next: Record<number, DraftRow> = {}
  for (const row of results) {
    const previous = drafts.value[row.id]
    next[row.id] = preserveDirty && previous?.dirty ? previous : draftFromResult(row)
  }
  drafts.value = next
}

watch(() => props.results, (results) => syncResults(results, true), { immediate: true, deep: true })
watch(() => props.version, (version) => { currentVersion.value = version })

function statusClass(status: string): string {
  if (status === 'CALIFICADO') return 'bg-[#e6f1e7] text-[#245c32]'
  if (status === 'AUSENTE') return 'bg-[#f1eee8] text-[#66512d]'
  return 'bg-[#f5eaea] text-[var(--color-brand)]'
}

function resultDescription(row: InscriptoResultado): string {
  if (row.resultado === 'PENDIENTE') return 'Pendiente de carga'
  if (row.resultado === 'AUSENTE') return 'Ausente sin nota'
  if (row.aprobado === true) return `Aprobado · mínima ${row.notaMinima}`
  return `No aprobado · mínima ${row.notaMinima}`
}

function markDirty(row: InscriptoResultado): void {
  const current = drafts.value[row.id] ?? draftFromResult(row)
  drafts.value[row.id] = { ...current, dirty: true }
  rowErrors.value[row.id] = ''
}

function toggleAbsence(row: InscriptoResultado): void {
  const current = drafts.value[row.id] ?? draftFromResult(row)
  drafts.value[row.id] = { ...current, ausente: !current.ausente, nota: '', dirty: true }
  rowErrors.value[row.id] = ''
}

function isConflict(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'status' in error && (error as { status?: number }).status === 409)
}

async function reloadAfterConflict(): Promise<void> {
  try {
    const snapshot = await props.reloadResults()
    currentVersion.value = snapshot.version
    syncResults(snapshot.results, true)
  } catch {
    panelError.value = 'No pudimos recargar la mesa. Conservamos tus cambios pendientes.'
  }
}

async function saveRow(row: InscriptoResultado): Promise<void> {
  if (readOnly.value || savingId.value !== null) return
  const draft = drafts.value[row.id] ?? draftFromResult(row)
  const trimmed = draft.nota.trim()
  const nota = Number(trimmed)
  if (!draft.ausente && (!trimmed || !Number.isInteger(nota) || nota < 0 || nota > 10)) {
    rowErrors.value[row.id] = `La nota de ${row.alumno.apellidoNombre} debe ser un entero entre 0 y 10, o marcá ausente.`
    return
  }

  savingId.value = row.id
  panelError.value = ''
  rowErrors.value[row.id] = ''
  const input: ResultWriteInput = draft.ausente
    ? { alumnoId: row.alumno.idUsuario, ausente: true, expectedVersion: currentVersion.value }
    : { alumnoId: row.alumno.idUsuario, nota, expectedVersion: currentVersion.value }
  try {
    const response = await props.saveResult(input)
    currentVersion.value = response.version
    drafts.value[row.id] = { ...draft, dirty: false }
    const snapshot = await props.reloadResults()
    currentVersion.value = snapshot.version
    syncResults(snapshot.results, true)
    const saved = snapshot.results.find((item) => item.id === row.id)
    if (saved) drafts.value[row.id] = draftFromResult(saved)
    emit('changed')
  } catch (error) {
    if (isConflict(error)) {
      panelError.value = 'Otra persona modificó la mesa. Recargamos la versión más reciente y conservamos tu cambio pendiente.'
      await reloadAfterConflict()
    } else {
      rowErrors.value[row.id] = 'No pudimos guardar este resultado. Revisá la conexión e intentá nuevamente.'
    }
  } finally {
    savingId.value = null
  }
}

function openCloseConfirmation(): void {
  if (canPublish.value && !tableSaving.value) closeConfirmationOpen.value = true
}

function cancelClose(): void {
  closeConfirmationOpen.value = false
}

async function confirmClose(): Promise<void> {
  if (!props.closeTable || !canPublish.value || tableSaving.value) return
  closeConfirmationOpen.value = false
  tableSaving.value = true
  panelError.value = ''
  try {
    const response = await props.closeTable(currentVersion.value)
    currentVersion.value = response.version
    emit('changed')
  } catch (error) {
    if (isConflict(error)) {
      panelError.value = 'Otra persona modificó la mesa antes del cierre. Recargamos la versión más reciente.'
      await reloadAfterConflict()
    } else {
      panelError.value = 'No se pudo cerrar la mesa. Verificá el tribunal y que todos los resultados estén completos.'
    }
  } finally {
    tableSaving.value = false
  }
}

async function reopenTable(): Promise<void> {
  const motivo = reopenReason.value.trim()
  if (!props.reopenTable || !props.canReopen || !motivo || tableSaving.value) {
    if (!motivo && props.canReopen) panelError.value = 'Indicá el motivo de reapertura.'
    return
  }
  tableSaving.value = true
  panelError.value = ''
  try {
    const response = await props.reopenTable(motivo, currentVersion.value)
    currentVersion.value = response.version
    reopenReason.value = ''
    emit('changed')
  } catch (error) {
    if (isConflict(error)) {
      panelError.value = 'Otra persona modificó la mesa antes de reabrirla. Recargamos la versión más reciente.'
      await reloadAfterConflict()
    } else {
      panelError.value = 'No se pudo reabrir la mesa.'
    }
  } finally {
    tableSaving.value = false
  }
}
</script>

<template>
  <section aria-labelledby="exam-results-title" class="mt-7 rounded-xl border border-[var(--color-border)] bg-white p-5 sm:p-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 id="exam-results-title" class="text-2xl font-semibold">Resultados de la mesa</h2>
        <p class="mt-1 text-sm text-[var(--color-graphite)]">Una fila por alumno. La aprobación se calcula con la nota mínima de la materia.</p>
      </div>
      <p v-if="status === 'FINALIZADA'" class="rounded-full bg-[#e6f1e7] px-3 py-1 text-sm font-semibold text-[#245c32]">Resultados publicados</p>
      <p v-else class="rounded-full bg-[#f5eaea] px-3 py-1 text-sm font-semibold text-[var(--color-brand)]">{{ academicLabel(status) }}</p>
    </div>

    <p v-if="panelError" class="mt-4 rounded-md border border-[#a31118]/30 bg-[#fff7f6] p-3 text-sm text-[#7b1116]" role="alert">{{ panelError }}</p>
    <p v-if="readOnly" class="mt-4 rounded-md border border-dashed border-[var(--color-border)] bg-[#f6f7f4] p-3 text-sm text-[var(--color-graphite)]">Mesa cerrada: los resultados publicados son de solo lectura.</p>

    <div v-if="!localResults.length" class="mt-5 rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-graphite)]">No hay alumnos inscriptos en esta mesa.</div>
    <div v-else class="mt-5 overflow-x-auto">
      <table class="min-w-[48rem] w-full text-left text-sm">
        <thead class="bg-[#f6f7f4] text-xs uppercase tracking-wide text-[var(--color-graphite)]">
          <tr><th class="px-3 py-3">Alumno</th><th class="px-3 py-3">Condición</th><th class="px-3 py-3">Estado</th><th class="px-3 py-3">Carga</th><th class="px-3 py-3 text-right">Acción</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in localResults" :key="row.id" class="border-t border-[var(--color-border)] align-top">
            <td class="px-3 py-4 font-semibold">{{ row.alumno.apellidoNombre }}</td>
            <td class="px-3 py-4">{{ academicLabel(row.condicion) }}</td>
            <td class="px-3 py-4"><span class="rounded-full px-2.5 py-1 text-xs font-semibold" :class="statusClass(row.resultado)">{{ academicLabel(row.resultado) }}</span><span class="mt-2 block text-xs text-[var(--color-graphite)]">{{ resultDescription(row) }}</span></td>
            <td class="px-3 py-4"><div class="flex items-center gap-3"><label class="block text-xs font-semibold" :for="`exam-grade-${row.id}`">Nota<input :id="`exam-grade-${row.id}`" :value="drafts[row.id]?.nota" type="number" min="0" max="10" step="1" :disabled="readOnly || drafts[row.id]?.ausente || savingId === row.id" :aria-label="`Nota de ${row.alumno.apellidoNombre}`" class="mt-1 min-h-10 w-20 rounded-md border border-[var(--color-border)] px-2 text-base font-normal" @input="drafts[row.id] = { ...(drafts[row.id] ?? draftFromResult(row)), nota: ($event.target as HTMLInputElement).value, ausente: false, dirty: true }; rowErrors[row.id] = ''" /></label><label class="mt-5 flex min-h-10 items-center gap-2 text-xs font-semibold"><input type="checkbox" :checked="drafts[row.id]?.ausente" :disabled="readOnly || savingId === row.id" :aria-label="`Ausente: ${row.alumno.apellidoNombre}`" class="h-5 w-5" @change="toggleAbsence(row)" />Ausente</label></div><p v-if="rowErrors[row.id]" class="mt-2 max-w-xs text-xs text-[#a31118]" role="alert">{{ rowErrors[row.id] }}</p></td>
            <td class="px-3 py-4 text-right"><button type="button" class="min-h-10 rounded-md bg-[var(--color-brand)] px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" :aria-label="`Guardar resultado de ${row.alumno.apellidoNombre}`" :disabled="readOnly || savingId !== null" @click="saveRow(row)">{{ savingId === row.id ? 'Guardando…' : 'Guardar' }}</button></td>
          </tr>
        </tbody>
      </table>
    </div>

      <div v-if="canClose" class="mt-6 flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[#f6f7f4] p-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p class="font-semibold">Cierre y publicación</p><p class="mt-1 text-sm text-[var(--color-graphite)]">{{ pendingCount ? `Quedan ${pendingCount} resultado(s) pendiente(s).` : 'Todos los inscriptos tienen resultado.' }}</p></div><button type="button" class="min-h-11 rounded-md bg-[var(--color-brand)] px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" :disabled="!canPublish || tableSaving" @click="openCloseConfirmation">{{ tableSaving ? 'Procesando…' : 'Cerrar y publicar mesa' }}</button>
    </div>

    <div v-if="closeConfirmationOpen" class="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" role="presentation">
      <section class="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="close-confirmation-title">
        <h3 id="close-confirmation-title" class="text-xl font-semibold">Confirmar cierre y publicación</h3>
        <p class="mt-2 text-sm text-[var(--color-graphite)]">Se publicarán los resultados actuales y la mesa quedará cerrada para edición.</p>
        <dl class="mt-4 grid gap-2 text-sm sm:grid-cols-3">
          <div><dt class="font-semibold">Calificados</dt><dd>{{ qualifiedCount }}</dd></div>
          <div><dt class="font-semibold">Ausentes</dt><dd>{{ absentCount }}</dd></div>
          <div><dt class="font-semibold">Pendientes</dt><dd>{{ pendingCount }}</dd></div>
        </dl>
        <div class="mt-6 flex flex-wrap justify-end gap-3">
          <button ref="closeCancelButton" type="button" aria-label="Cancelar cierre" class="min-h-11 rounded-md border border-[var(--color-border)] px-4 py-2 font-semibold" @click="cancelClose">Cancelar</button>
          <button type="button" class="min-h-11 rounded-md bg-[var(--color-brand)] px-4 py-2 font-semibold text-white" @click="confirmClose">Confirmar cierre y publicación</button>
        </div>
      </section>
    </div>

    <form v-if="canReopen && status === 'FINALIZADA'" class="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4" @submit.prevent="reopenTable"><label class="block text-sm font-semibold" for="reopen-reason">Motivo de reapertura<textarea id="reopen-reason" v-model="reopenReason" class="mt-1 min-h-20 w-full rounded-md border border-amber-300 bg-white px-3 py-2 font-normal" placeholder="Por ejemplo: corrección de acta"></textarea></label><button type="submit" class="mt-3 min-h-11 rounded-md border border-[var(--color-brand)] px-4 py-2 font-semibold text-[var(--color-brand)]" :disabled="tableSaving">Reabrir mesa</button></form>
  </section>
</template>
