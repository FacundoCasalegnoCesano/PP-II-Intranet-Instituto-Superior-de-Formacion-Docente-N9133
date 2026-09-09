<script setup lang="ts">
defineProps<{
  approved: number
  total: number
  percent: number
  average: number | null
}>()
</script>

<template>
  <section class="rounded-lg border border-[var(--color-border)] bg-white p-5" aria-labelledby="academic-progress-title">
    <h2 id="academic-progress-title" class="text-xl font-semibold text-[var(--color-text)]">Mi progreso académico</h2>
    <p class="mt-4 text-lg font-semibold text-[var(--color-text)]">{{ approved }} de {{ total }} materias aprobadas</p>
    <div class="mt-3 h-3 overflow-hidden rounded-full bg-[#e9eeea]" role="progressbar" aria-label="Progreso académico" :aria-valuenow="percent" aria-valuemin="0" aria-valuemax="100">
      <div class="h-full bg-[var(--color-brand)] transition-[width]" :style="{ width: `${percent}%` }" />
    </div>
    <p class="mt-2 text-sm text-[var(--color-graphite)]">{{ percent }}% del plan aprobado</p>
    <p class="mt-5 border-t border-[var(--color-border)] pt-4 font-semibold text-[var(--color-text)]">
      <template v-if="average !== null">Promedio general: {{ average }}</template>
      <template v-else>Promedio general: sin calificaciones definitivas</template>
    </p>
  </section>
</template>
