<script setup lang="ts">
import { onBeforeUnmount, useId } from 'vue'
import AppButton from '@/ui/AppButton.vue'

defineProps<{ search?: string; searchLabel?: string; placeholder?: string }>()
const emit = defineEmits<{ 'update:search': [value: string]; searching: []; submit: [] }>()
const searchId = useId()
let searchTimer: ReturnType<typeof setTimeout> | null = null

function clearSearchTimer(): void {
  if (searchTimer !== null) clearTimeout(searchTimer)
  searchTimer = null
}

function scheduleSubmit(event: Event): void {
  emit('searching')
  emit('update:search', (event.target as HTMLInputElement).value)
  clearSearchTimer()
  searchTimer = setTimeout(() => {
    searchTimer = null
    emit('submit')
  }, 300)
}

function submit(): void {
  clearSearchTimer()
  emit('submit')
}

function cancelForFilterChange(event: Event): void {
  if (event.target instanceof HTMLInputElement || searchTimer === null) return
  clearSearchTimer()
  emit('submit')
}

onBeforeUnmount(clearSearchTimer)
</script>

<template>
  <form class="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-white p-4 sm:flex-row sm:items-end" @submit.prevent="submit" @change="cancelForFilterChange">
    <label :for="searchId" class="flex-1 text-sm font-semibold text-[var(--color-text)]">{{ searchLabel ?? 'Buscar' }}<input :id="searchId" :value="search" :placeholder="placeholder ?? 'Buscar…'" class="admin-input mt-1" @input="scheduleSubmit" /></label>
    <slot />
    <AppButton type="submit">Aplicar</AppButton>
  </form>
</template>
