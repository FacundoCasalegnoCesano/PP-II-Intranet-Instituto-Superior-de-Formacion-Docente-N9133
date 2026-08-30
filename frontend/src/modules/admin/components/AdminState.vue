<script setup lang="ts">
defineProps<{ loading?: boolean; error?: string | null; empty?: boolean; emptyText?: string }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div v-if="loading" class="rounded-xl border border-[var(--color-border)] bg-white p-10 text-center text-[var(--color-graphite)]" role="status" aria-live="polite">Cargando…</div>
  <div v-else-if="error" class="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-800" role="alert"><p>{{ error }}</p><button type="button" class="mt-3 min-h-10 rounded-lg bg-[var(--color-brand)] px-4 font-semibold text-white" @click="$emit('retry')">Reintentar</button></div>
  <div v-else-if="empty" class="rounded-xl border border-dashed border-[var(--color-border)] bg-white p-10 text-center text-[var(--color-graphite)]">{{ emptyText ?? 'No hay registros para mostrar.' }}</div>
  <slot v-else />
</template>
