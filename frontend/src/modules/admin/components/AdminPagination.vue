<script setup lang="ts">
import type { PaginationMeta } from '@/core/api/contracts'
import AppButton from '@/ui/AppButton.vue'
const props = defineProps<{ pagination: PaginationMeta }>()
const emit = defineEmits<{ change: [page: number] }>()
</script>

<template>
  <nav v-if="props.pagination.totalPages > 1" class="flex items-center justify-between gap-3 py-4 text-sm" aria-label="Paginación">
    <span class="text-[var(--color-graphite)]" aria-live="polite">Página {{ props.pagination.page }} de {{ props.pagination.totalPages }}</span>
    <div class="flex gap-2"><AppButton variant="secondary" :disabled="props.pagination.page <= 1" aria-label="Página anterior" @click="emit('change', props.pagination.page - 1)">Anterior</AppButton><AppButton variant="secondary" :disabled="props.pagination.page >= props.pagination.totalPages" aria-label="Página siguiente" @click="emit('change', props.pagination.page + 1)">Siguiente</AppButton></div>
  </nav>
</template>
