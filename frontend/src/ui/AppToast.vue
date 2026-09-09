<script setup lang="ts">
import { CircleCheck, CircleAlert, Info, X } from 'lucide-vue-next'
import { useFeedback } from './feedback'

const feedback = useFeedback()
const iconByKind = { success: CircleCheck, error: CircleAlert, info: Info }
</script>

<template>
  <section aria-label="Mensajes del sistema" class="pointer-events-none fixed inset-x-4 top-4 z-50 flex flex-col items-end gap-3 sm:left-auto sm:w-96">
    <div
      v-for="message in feedback.messages.value"
      :key="message.id"
      role="status"
      aria-live="polite"
      class="pointer-events-auto flex w-full items-start gap-3 rounded-lg border border-[var(--color-border)] bg-white p-4 shadow-lg"
      :class="{
        'border-emerald-300': message.kind === 'success',
        'border-red-300': message.kind === 'error',
      }"
    >
      <component :is="iconByKind[message.kind]" class="mt-0.5 size-5 shrink-0 text-[var(--color-brand)]" aria-hidden="true" />
      <p class="flex-1 text-sm text-[var(--color-text)]">{{ message.text }}</p>
      <button type="button" class="rounded p-1 text-[var(--color-graphite)]" aria-label="Cerrar mensaje" @click="feedback.dismiss(message.id)">
        <X class="size-4" aria-hidden="true" />
      </button>
    </div>
  </section>
</template>
