<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import ConfirmDialog from '@/ui/ConfirmDialog.vue'
import HomologationStatusBadge from './HomologationStatusBadge.vue'
import { canApproveHomologation, formatHomologationDate } from '../presentation'
import type { Homologation } from '../types/homologations'

type ConfirmationAction = 'APROBAR' | 'RECHAZAR'
type ErrorTarget = 'grade' | 'approve' | 'reject' | null

const props = withDefaults(defineProps<{
  item: Homologation
  actionBusy?: boolean
  mutationsBlocked?: boolean
  actionError?: string | null
  errorTarget?: ErrorTarget
  focusParentFeedback?: boolean
}>(), {
  actionBusy: false,
  mutationsBlocked: false,
  actionError: null,
  errorTarget: null,
  focusParentFeedback: false,
})

const emit = defineEmits<{
  'save-grade': [grade: number]
  approve: []
  reject: []
}>()

const summary = ref<HTMLElement | null>(null)
const gradeInput = ref<HTMLInputElement | null>(null)
const approveButton = ref<HTMLButtonElement | null>(null)
const rejectButton = ref<HTMLButtonElement | null>(null)
const confirmationTrigger = ref<HTMLElement | null>(null)
const gradeDraft = ref<string | number>('')
const gradeError = ref('')
const confirmation = ref<ConfirmationAction | null>(null)

const isPending = computed(() => props.item.estado === 'PENDIENTE')
const isPartial = computed(() => props.item.tipo === 'PARCIAL')
const canSaveGrade = computed(() => isPending.value && isPartial.value)
const canApprove = computed(() => canApproveHomologation(props.item))
const actionsDisabled = computed(() => props.actionBusy || props.mutationsBlocked)
const minimumGrade = computed(() => props.item.materia.notaMinima)
const eligibilityMessage = computed(() => {
  if (!canSaveGrade.value) return ''
  if (props.item.notaComplementaria === null) return 'Completá una nota complementaria entera entre 0 y 10 para habilitar la aprobación.'
  if (!canApprove.value) return `La nota debe ser igual o mayor que ${minimumGrade.value} para aprobar.`
  return 'Nota suficiente para aprobar.'
})

watch(() => props.item, (item) => {
  gradeDraft.value = item.notaComplementaria === null ? '' : String(item.notaComplementaria)
  gradeError.value = ''
}, { immediate: true })

watch(() => props.actionError, (error) => {
  if (!error) return
  void nextTick(() => {
    const target = props.errorTarget === 'grade'
      ? gradeInput.value
      : props.errorTarget === 'approve'
        ? approveButton.value
        : props.errorTarget === 'reject'
          ? rejectButton.value
          : null
    if (target && target.isConnected && !target.disabled) target.focus()
    else summary.value?.focus()
  })
})

watch(() => props.actionBusy, (busy, wasBusy) => {
  if (busy || !wasBusy || props.actionError || props.focusParentFeedback) return
  void nextTick(() => {
    const trigger = confirmationTrigger.value
    if (trigger && trigger.isConnected && !trigger.hasAttribute('disabled')) trigger.focus()
    else summary.value?.focus()
  })
})

watch(() => props.mutationsBlocked, (blocked) => {
  if (blocked && confirmation.value) cancelConfirmation()
})

function errorId(): string {
  return `homologation-${props.item.id}-grade-error`
}

function requestConfirmation(action: ConfirmationAction): void {
  if (!isPending.value || actionsDisabled.value || (action === 'APROBAR' && !canApprove.value)) return
  confirmationTrigger.value = action === 'APROBAR' ? approveButton.value : rejectButton.value
  confirmation.value = action
}

function cancelConfirmation(): void {
  const trigger = confirmationTrigger.value
  confirmation.value = null
  void nextTick(() => {
    if (trigger && trigger.isConnected && !trigger.hasAttribute('disabled')) trigger.focus()
    else summary.value?.focus()
  })
}

function confirmAction(): void {
  const action = confirmation.value
  if (!action || !isPending.value || actionsDisabled.value || (action === 'APROBAR' && !canApprove.value)) return
  confirmation.value = null
  emit(action === 'APROBAR' ? 'approve' : 'reject')
}

function saveGrade(): void {
  if (!canSaveGrade.value || actionsDisabled.value) return
  const rawValue = String(gradeDraft.value).trim()
  const value = Number(rawValue)
  if (!rawValue || !Number.isInteger(value) || value < 0 || value > 10) {
    gradeError.value = 'Ingresá una nota entera entre 0 y 10.'
    void nextTick(() => gradeInput.value?.focus())
    return
  }
  gradeError.value = ''
  emit('save-grade', value)
}

function displayGrade(value: number | null): string | number {
  return value ?? '—'
}
</script>

<template>
  <section aria-labelledby="homologation-detail-title" class="mt-6 max-w-4xl rounded-xl border border-[var(--color-border)] bg-white p-4 sm:p-6">
    <div ref="summary" data-detail-summary tabindex="-1" class="outline-none">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p class="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--color-brand)]">Detalle</p>
          <h2 id="homologation-detail-title" class="mt-2 text-2xl font-semibold">Detalle de homologación</h2>
          <p class="mt-1 text-sm text-[var(--color-graphite)]">Solicitud #{{ item.id }}</p>
        </div>
        <HomologationStatusBadge :item="item" />
      </div>

      <dl class="mt-6 grid min-w-0 gap-4 sm:grid-cols-2">
        <div><dt class="font-semibold">Alumno</dt><dd class="break-words">{{ item.alumno.apellidoNombre }} · DNI {{ item.alumno.dni }}</dd></div>
        <div><dt class="font-semibold">Correo</dt><dd class="break-words">{{ item.alumno.email }}</dd></div>
        <div><dt class="font-semibold">Carrera</dt><dd>{{ item.materia.carrera.nombre }}</dd></div>
        <div><dt class="font-semibold">Materia</dt><dd>{{ item.materia.nombre }}</dd></div>
        <div><dt class="font-semibold">Tipo</dt><dd>{{ item.tipo === 'TOTAL' ? 'Total' : 'Parcial' }}</dd></div>
        <div><dt class="font-semibold">Fecha</dt><dd>{{ formatHomologationDate(item.fecha) }}</dd></div>
        <div><dt class="font-semibold">Nota de origen</dt><dd>{{ displayGrade(item.calificacion) }}</dd></div>
        <div><dt class="font-semibold">Nota complementaria</dt><dd>{{ displayGrade(item.notaComplementaria) }}</dd></div>
        <div class="sm:col-span-2"><dt class="font-semibold">Observación</dt><dd class="whitespace-pre-wrap break-words">{{ item.observacion || 'Sin observación.' }}</dd></div>
      </dl>
    </div>

    <form v-if="canSaveGrade" class="mt-7 rounded-lg border border-[var(--color-border)] bg-[#f6f7f4] p-4" @submit.prevent="saveGrade">
      <label for="complementary-grade" class="font-semibold">Nota del examen complementario</label>
      <input id="complementary-grade" ref="gradeInput" v-model="gradeDraft" type="number" min="0" max="10" step="1" inputmode="numeric" class="mt-1 min-h-11 w-full rounded-lg border border-[var(--color-border)] bg-white px-3 font-normal" :disabled="actionsDisabled" :aria-invalid="Boolean(gradeError)" :aria-describedby="gradeError ? `${errorId()} complementary-grade-help` : 'complementary-grade-help'" />
      <p id="complementary-grade-help" class="mt-1 text-sm text-[var(--color-graphite)]">Número entero entre 0 y 10. La nota puede guardarse aunque sea insuficiente.</p>
      <p v-if="gradeError" :id="errorId()" class="mt-1 text-sm text-[#a31118]" role="alert">{{ gradeError }}</p>
      <p class="mt-3 text-sm font-semibold text-[var(--color-graphite)]" role="status" aria-live="polite">{{ eligibilityMessage }}</p>
      <button type="submit" class="mt-4 min-h-11 rounded-lg bg-[var(--color-brand)] px-4 py-2.5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" :disabled="actionsDisabled">{{ actionBusy ? 'Guardando…' : 'Guardar nota complementaria' }}</button>
    </form>

    <p v-if="isPending && !canSaveGrade" class="mt-7 rounded-lg border border-[var(--color-border)] bg-[#f6f7f4] p-4 text-sm text-[var(--color-graphite)]" role="status" aria-live="polite">La homologación total se puede resolver directamente.</p>

    <div v-if="isPending" class="mt-7 flex flex-col gap-3 sm:flex-row">
      <button ref="approveButton" type="button" class="min-h-11 rounded-lg bg-[var(--color-brand)] px-4 py-2.5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" :disabled="!canApprove || actionsDisabled" @click="requestConfirmation('APROBAR')">Aprobar homologación</button>
      <button ref="rejectButton" type="button" class="min-h-11 rounded-lg border border-[var(--color-brand)] px-4 py-2.5 font-semibold text-[var(--color-brand)] disabled:cursor-not-allowed disabled:opacity-50" :disabled="actionsDisabled" @click="requestConfirmation('RECHAZAR')">Rechazar homologación</button>
    </div>

    <ConfirmDialog
      :open="confirmation === 'APROBAR'"
      title="Confirmar aprobación"
      description="La solicitud quedará aprobada y la decisión no podrá editarse desde esta pantalla."
      confirm-label="Aprobar"
      :loading="actionBusy"
      @cancel="cancelConfirmation"
      @confirm="confirmAction"
    />
    <ConfirmDialog
      :open="confirmation === 'RECHAZAR'"
      title="Confirmar rechazo"
      description="La solicitud quedará rechazada y la decisión no podrá editarse desde esta pantalla."
      confirm-label="Rechazar"
      :loading="actionBusy"
      @cancel="cancelConfirmation"
      @confirm="confirmAction"
    />
  </section>
</template>
