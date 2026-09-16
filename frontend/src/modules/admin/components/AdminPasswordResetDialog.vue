<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { X, Eye, EyeOff } from 'lucide-vue-next'
import { adminPasswordResetSchema } from '../schemas/adminSchemas'

const props = defineProps<{ open: boolean; userName: string; loading?: boolean; error?: string }>()
const emit = defineEmits<{ submit: [newPassword: string]; cancel: [] }>()
const newPassword = ref(''); const passwordConfirm = ref(''); const showPassword = ref(false); const showConfirm = ref(false)
const fieldErrors = ref<{ newPassword?: string; passwordConfirm?: string }>({}); const firstInput = ref<HTMLInputElement | null>(null); const lastFocused = ref<HTMLElement | null>(null)

watch(() => props.open, async (open) => {
  if (open) { lastFocused.value = document.activeElement as HTMLElement; await nextTick(); firstInput.value?.focus() }
  else if (!props.loading) { clear(); lastFocused.value?.focus?.(); lastFocused.value = null }
})

function clear(): void { newPassword.value = ''; passwordConfirm.value = ''; showPassword.value = false; showConfirm.value = false; fieldErrors.value = {} }
function cancel(): void { if (!props.loading) emit('cancel') }
function submit(): void {
  fieldErrors.value = {}
  const result = adminPasswordResetSchema.safeParse({ newPassword: newPassword.value, passwordConfirm: passwordConfirm.value })
  if (!result.success) { for (const issue of result.error.issues) fieldErrors.value[String(issue.path[0]) as 'newPassword' | 'passwordConfirm'] ??= issue.message; return }
  emit('submit', result.data.newPassword)
}
function onKeydown(event: KeyboardEvent): void { if (props.open && event.key === 'Escape') { event.preventDefault(); cancel() } }
document.addEventListener('keydown', onKeydown)
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 grid place-items-center bg-[#171a18]/45 p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="password-reset-title" aria-describedby="password-reset-description" class="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
      <div class="flex items-start justify-between gap-4">
        <div><h2 id="password-reset-title" class="text-xl font-semibold">Asignar nueva contraseña</h2><p id="password-reset-description" class="mt-2 text-[var(--color-graphite)]">Usuario: {{ userName }}</p></div>
        <button type="button" class="rounded p-1" aria-label="Cancelar" :disabled="loading" @click="cancel"><X class="size-5" /></button>
      </div>
      <p class="mt-4 rounded-lg bg-[#f6f7f4] p-3 text-sm text-[var(--color-graphite)]">Se cerrarán todas las sesiones activas de este usuario.</p>
      <form class="mt-5 space-y-4" novalidate @submit.prevent="submit">
        <div><label for="admin-reset-password" class="font-semibold">Nueva contraseña</label><div class="relative mt-1"><input id="admin-reset-password" ref="firstInput" v-model="newPassword" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" class="admin-input pr-11" :aria-invalid="Boolean(fieldErrors.newPassword)" aria-describedby="admin-reset-password-help admin-reset-password-error" /><button type="button" class="absolute right-2 top-1/2 -translate-y-1/2 p-2" :aria-label="showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'" :disabled="loading" @click="showPassword = !showPassword"> <EyeOff v-if="showPassword" class="size-5" /><Eye v-else class="size-5" /></button></div><p id="admin-reset-password-help" class="mt-1 text-xs text-[var(--color-graphite)]">8 a 50 caracteres, con mayúscula, minúscula, número y carácter especial.</p><p v-if="fieldErrors.newPassword" id="admin-reset-password-error" class="field-error" role="alert">{{ fieldErrors.newPassword }}</p></div>
        <div><label for="admin-reset-password-confirm" class="font-semibold">Confirmar contraseña</label><div class="relative mt-1"><input id="admin-reset-password-confirm" v-model="passwordConfirm" :type="showConfirm ? 'text' : 'password'" autocomplete="new-password" class="admin-input pr-11" :aria-invalid="Boolean(fieldErrors.passwordConfirm)" aria-describedby="admin-reset-password-confirm-error" /><button type="button" class="absolute right-2 top-1/2 -translate-y-1/2 p-2" :aria-label="showConfirm ? 'Ocultar confirmación' : 'Mostrar confirmación'" :disabled="loading" @click="showConfirm = !showConfirm"><EyeOff v-if="showConfirm" class="size-5" /><Eye v-else class="size-5" /></button></div><p v-if="fieldErrors.passwordConfirm" id="admin-reset-password-confirm-error" class="field-error" role="alert">{{ fieldErrors.passwordConfirm }}</p></div>
        <p v-if="error" class="field-error" role="alert">{{ error }}</p>
        <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" class="min-h-11 rounded-lg border border-[var(--color-border)] px-4 py-2.5 font-semibold disabled:opacity-50" :disabled="loading" @click="cancel">Cancelar</button><button type="submit" class="min-h-11 rounded-lg bg-[var(--color-brand)] px-4 py-2.5 font-semibold text-white disabled:opacity-50" :disabled="loading">{{ loading ? 'Guardando…' : 'Asignar contraseña' }}</button></div>
      </form>
    </section>
  </div>
</template>

<style scoped>
.admin-input { min-height: 2.75rem; width: 100%; border: 1px solid var(--color-border); border-radius: .5rem; padding: 0 .75rem; font-weight: 400; }
.field-error { margin-top: .25rem; font-size: .875rem; color: #a31118; }
</style>
