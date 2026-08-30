<script setup lang="ts">
defineProps<{ search?: string; searchLabel?: string; placeholder?: string }>()
const emit = defineEmits<{ 'update:search': [value: string]; submit: [] }>()
</script>

<template>
  <form class="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-white p-4 sm:flex-row sm:items-end" @submit.prevent="emit('submit')">
    <label class="flex-1 text-sm font-semibold text-[var(--color-text)]">{{ searchLabel ?? 'Buscar' }}<input :value="search" :placeholder="placeholder ?? 'Buscar…'" class="mt-1 min-h-11 w-full rounded-lg border border-[var(--color-border)] px-3 font-normal" @input="emit('update:search', ($event.target as HTMLInputElement).value)" /></label>
    <slot />
    <button type="submit" class="min-h-11 rounded-lg bg-[var(--color-brand)] px-5 font-semibold text-white hover:bg-[#74151a]">Aplicar</button>
  </form>
</template>
