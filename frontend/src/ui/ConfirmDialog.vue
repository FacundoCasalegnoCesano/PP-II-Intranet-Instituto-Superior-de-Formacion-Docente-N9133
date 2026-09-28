<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import AppButton from './AppButton.vue'

const props = withDefaults(defineProps<{
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  loading?: boolean
  error?: string
}>(), { confirmLabel: 'Confirmar' })

const emit = defineEmits<{ confirm: []; cancel: [] }>()
const dialog = ref<HTMLElement>()
const cancelButton = ref<InstanceType<typeof AppButton>>()
let returnFocusElement: HTMLElement | null = null

function focusableElements(): HTMLElement[] {
  return Array.from(dialog.value?.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ) ?? [])
}

watch(() => props.open, async (open) => {
  if (open) {
    returnFocusElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
    await nextTick()
    cancelButton.value?.focus()
  } else if (returnFocusElement?.isConnected) {
    returnFocusElement.focus()
    returnFocusElement = null
  }
}, { immediate: true })

function onDocumentKeydown(event: KeyboardEvent): void {
  if (!props.open) return
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('cancel')
    return
  }
  if (event.key !== 'Tab') return
  const focusable = focusableElements()
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

onMounted(() => document.addEventListener('keydown', onDocumentKeydown))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDocumentKeydown)
  if (props.open && returnFocusElement?.isConnected) returnFocusElement.focus()
})
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#171a18]/45 p-4">
    <section ref="dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" :aria-describedby="error ? 'confirm-description confirm-error' : 'confirm-description'" class="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 id="confirm-title" class="text-xl font-semibold text-[var(--color-text)]">{{ title }}</h2>
          <p id="confirm-description" class="mt-2 text-[var(--color-graphite)]">{{ description }}</p>
        </div>
        <button type="button" class="min-h-11 min-w-11 rounded p-2" aria-label="Cancelar" @click="emit('cancel')"><X class="size-5" aria-hidden="true" /></button>
      </div>
      <p v-if="error" id="confirm-error" class="mt-4 rounded-md border border-[#c97578] bg-[#fff7f6] p-3 text-sm text-[var(--color-brand)]" role="alert">{{ error }}</p>
      <div class="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <AppButton ref="cancelButton" variant="secondary" @click="emit('cancel')">Cancelar</AppButton>
        <AppButton :loading="loading" @click="emit('confirm')">{{ confirmLabel }}</AppButton>
      </div>
    </section>
  </div>
</template>
