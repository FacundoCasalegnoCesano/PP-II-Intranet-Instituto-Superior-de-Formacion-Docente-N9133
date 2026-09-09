<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(defineProps<{
  variant?: 'primary' | 'secondary' | 'ghost'
  loading?: boolean
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}>(), {
  variant: 'primary',
  type: 'button',
})

const button = ref<HTMLButtonElement>()
defineExpose({ focus: () => button.value?.focus() })

const classes = computed(() => ({
  primary: 'bg-[var(--color-brand)] text-white hover:bg-[#6d1015]',
  secondary: 'border border-[var(--color-brand)] bg-white text-[var(--color-brand)] hover:bg-[#fff7f6]',
  ghost: 'text-[var(--color-graphite)] hover:bg-black/5',
}[props.variant]))
</script>

<template>
  <button
    ref="button"
    :type="type"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
    class="inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-2.5 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-55"
    :class="classes"
  >
    <span v-if="loading" class="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />
    <slot />
  </button>
</template>
