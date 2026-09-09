<script setup lang="ts">
defineProps<{ columns: Array<{ key: string; label: string }> }>()
</script>

<template>
  <div class="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
    <div class="hidden overflow-x-auto md:block">
      <table class="min-w-full text-left text-sm">
        <thead class="bg-[#f6f7f4] text-xs uppercase tracking-wide text-[var(--color-graphite)]"><tr><th v-for="column in columns" :key="column.key" class="px-4 py-3 font-semibold">{{ column.label }}</th><th class="px-4 py-3"><span class="sr-only">Acciones</span></th></tr></thead>
        <tbody><slot name="rows" /></tbody>
      </table>
    </div>
    <div class="space-y-3 p-3 md:hidden"><slot name="cards" /></div>
  </div>
</template>
