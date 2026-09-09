<script setup lang="ts">
import type { PaginationMeta } from '@/core/api/contracts'
const props = defineProps<{ pagination: PaginationMeta }>()
const emit = defineEmits<{ change: [page: number] }>()
</script>

<template>
  <nav v-if="props.pagination.totalPages > 1" class="flex items-center justify-between gap-3 py-4 text-sm" aria-label="Paginación">
    <span class="text-[var(--color-graphite)]">Página {{ props.pagination.page }} de {{ props.pagination.totalPages }}</span>
    <div class="flex gap-2"><button type="button" class="min-h-10 rounded-lg border border-[var(--color-border)] px-3 disabled:opacity-40" :disabled="props.pagination.page <= 1" @click="emit('change', props.pagination.page - 1)">Anterior</button><button type="button" class="min-h-10 rounded-lg border border-[var(--color-border)] px-3 disabled:opacity-40" :disabled="props.pagination.page >= props.pagination.totalPages" @click="emit('change', props.pagination.page + 1)">Siguiente</button></div>
  </nav>
</template>
