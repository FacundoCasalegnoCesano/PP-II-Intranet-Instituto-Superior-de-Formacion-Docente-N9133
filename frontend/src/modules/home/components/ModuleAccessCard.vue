<script setup lang="ts">
import type { Component } from 'vue'
import type { RouteLocationRaw } from 'vue-router'

defineProps<{
  label: string
  description: string
  icon: Component
  to?: RouteLocationRaw
  status?: string
}>()
</script>

<template>
  <RouterLink
    v-if="to"
    :to="to"
    role="link"
    class="group block h-full rounded-lg border border-[var(--color-border)] bg-white p-5 transition hover:border-[var(--color-brand)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand)]"
  >
    <component :is="icon" class="size-6 text-[var(--color-brand)]" role="img" aria-hidden="true" />
    <h3 class="mt-4 font-semibold text-[var(--color-text)]">{{ label }}</h3>
    <p class="mt-2 text-sm leading-6 text-[var(--color-graphite)]">{{ description }}</p>
    <span v-if="status" class="mt-3 inline-block rounded-full bg-[#f4e7e7] px-2.5 py-1 text-xs font-semibold text-[var(--color-brand)]">{{ status }}</span>
  </RouterLink>

  <article
    v-else
    :aria-label="label"
    class="h-full rounded-lg border border-[var(--color-border)] bg-white p-5"
  >
    <component :is="icon" class="size-6 text-[var(--color-brand)]" role="img" aria-hidden="true" />
    <h3 class="mt-4 font-semibold text-[var(--color-text)]">{{ label }}</h3>
    <p class="mt-2 text-sm leading-6 text-[var(--color-graphite)]">{{ description }}</p>
    <span v-if="status" class="mt-3 inline-block rounded-full bg-[#f4e7e7] px-2.5 py-1 text-xs font-semibold text-[var(--color-brand)]">{{ status }}</span>
  </article>
</template>
