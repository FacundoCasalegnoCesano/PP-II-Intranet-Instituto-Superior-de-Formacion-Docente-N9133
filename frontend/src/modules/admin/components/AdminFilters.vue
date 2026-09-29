<script setup lang="ts">
import { useId } from 'vue'
import AppButton from '@/ui/AppButton.vue'

defineProps<{ search?: string; searchLabel?: string; placeholder?: string }>()
const emit = defineEmits<{ 'update:search': [value: string]; submit: [] }>()
const searchId = useId()
</script>

<template>
  <form class="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-white p-4 sm:flex-row sm:items-end" @submit.prevent="emit('submit')">
    <label :for="searchId" class="flex-1 text-sm font-semibold text-[var(--color-text)]">{{ searchLabel ?? 'Buscar' }}<input :id="searchId" :value="search" :placeholder="placeholder ?? 'Buscar…'" class="admin-input mt-1" @input="emit('update:search', ($event.target as HTMLInputElement).value)" /></label>
    <slot />
    <AppButton type="submit">Aplicar</AppButton>
  </form>
</template>
