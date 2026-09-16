<script setup lang="ts">
import { computed } from 'vue'
import { CheckCircle2, CircleX, Clock3 } from 'lucide-vue-next'
import { homologationStateInfo } from '../presentation'
import type { Homologation } from '../types/homologations'

const props = defineProps<{ item: Homologation }>()

const state = computed(() => homologationStateInfo(props.item))
const label = computed(() => state.value.label)
const tone = computed(() => state.value.tone)
const icon = computed(() => {
  if (tone.value === 'success') return CheckCircle2
  if (tone.value === 'danger') return CircleX
  return Clock3
})

const toneClass = computed(() => ({
  warning: 'bg-amber-100 text-amber-900',
  success: 'bg-[#e6f1e7] text-[#245c32]',
  danger: 'bg-[#f5eaea] text-[var(--color-brand)]',
}[tone.value]))
</script>

<template>
  <span class="inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold" :class="toneClass" role="status" :aria-label="`Estado oficial: ${state.officialLabel}${state.operationalLabel ? `. ${state.operationalLabel}` : ''}`">
    <component :is="icon" data-status-icon aria-hidden="true" focusable="false" class="size-4 shrink-0" />
    <span>{{ state.officialLabel }}</span>
    <span v-if="state.operationalLabel" aria-hidden="true">· {{ label }}</span>
  </span>
</template>
