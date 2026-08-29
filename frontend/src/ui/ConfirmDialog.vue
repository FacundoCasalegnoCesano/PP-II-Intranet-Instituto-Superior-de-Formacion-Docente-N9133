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
}>(), { confirmLabel: 'Confirmar' })

const emit = defineEmits<{ confirm: []; cancel: [] }>()
const cancelButton = ref<HTMLButtonElement>()

watch(() => props.open, async (open) => {
  if (open) {
    await nextTick()
    cancelButton.value?.focus()
  }
}, { immediate: true })

function onDocumentKeydown(event: KeyboardEvent): void {
  if (props.open && event.key === 'Escape') {
    event.preventDefault()
    emit('cancel')
  }
}

onMounted(() => document.addEventListener('keydown', onDocumentKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onDocumentKeydown))
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 grid place-items-center bg-[#171a18]/45 p-4">
    <section role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description" class="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 id="confirm-title" class="text-xl font-semibold text-[var(--color-text)]">{{ title }}</h2>
          <p id="confirm-description" class="mt-2 text-[var(--color-graphite)]">{{ description }}</p>
        </div>
        <button type="button" class="rounded p-1" aria-label="Cancelar" @click="emit('cancel')"><X class="size-5" /></button>
      </div>
      <div class="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <AppButton ref="cancelButton" variant="secondary" @click="emit('cancel')">Cancelar</AppButton>
        <AppButton :loading="loading" @click="emit('confirm')">{{ confirmLabel }}</AppButton>
      </div>
    </section>
  </div>
</template>
