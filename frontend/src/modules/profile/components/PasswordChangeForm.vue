<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { ref } from 'vue'
import AppButton from '@/ui/AppButton.vue'
import { useFeedback } from '@/ui/feedback'
import { changeOwnPassword } from '../api/profileApi'
import { changePasswordSchema } from '../schemas/profileSchemas'

const error = ref('')
const feedback = useFeedback()
const { defineField, errors, handleSubmit, isSubmitting, resetForm } = useForm({ validationSchema: toTypedSchema(changePasswordSchema) })
const [currentPassword, currentPasswordAttrs] = defineField('currentPassword')
const [newPassword, newPasswordAttrs] = defineField('newPassword')
const [confirmation, confirmationAttrs] = defineField('confirmation')
const submit = handleSubmit(async ({ currentPassword: current, newPassword }) => {
  error.value = ''
  try { await changeOwnPassword({ currentPassword: current, newPassword }); resetForm(); feedback.success('Contraseña actualizada. Las demás sesiones fueron revocadas.') }
  catch { error.value = 'No pudimos actualizar la contraseña. Verificá la contraseña actual e intentá nuevamente.'; feedback.error('No se pudo actualizar la contraseña.') }
})
</script>

<template>
  <section class="rounded-lg border border-[var(--color-border)] bg-white p-5" aria-labelledby="password-title">
    <h2 id="password-title" class="text-xl font-semibold text-[var(--color-text)]">Cambiar contraseña</h2>
    <p class="mt-1 text-sm text-[var(--color-graphite)]">La sesión actual se mantiene activa; se cerrarán las demás sesiones.</p>
    <form class="mt-5 space-y-4" novalidate @submit="submit">
      <div><label for="current-password" class="mb-1 block font-semibold">Contraseña actual</label><input id="current-password" v-model="currentPassword" v-bind="currentPasswordAttrs" type="password" autocomplete="current-password" class="min-h-11 w-full rounded-md border border-[var(--color-border)] px-3 py-2" :aria-invalid="!!errors.currentPassword" /><p v-if="errors.currentPassword" class="mt-1 text-sm text-[#a31118]">{{ errors.currentPassword }}</p></div>
      <div><label for="new-password" class="mb-1 block font-semibold">Nueva contraseña</label><input id="new-password" v-model="newPassword" v-bind="newPasswordAttrs" type="password" autocomplete="new-password" class="min-h-11 w-full rounded-md border border-[var(--color-border)] px-3 py-2" :aria-invalid="!!errors.newPassword" /><p v-if="errors.newPassword" class="mt-1 text-sm text-[#a31118]">{{ errors.newPassword }}</p></div>
      <div><label for="password-confirmation" class="mb-1 block font-semibold">Confirmar nueva contraseña</label><input id="password-confirmation" v-model="confirmation" v-bind="confirmationAttrs" type="password" autocomplete="new-password" class="min-h-11 w-full rounded-md border border-[var(--color-border)] px-3 py-2" :aria-invalid="!!errors.confirmation" /><p v-if="errors.confirmation" class="mt-1 text-sm text-[#a31118]">{{ errors.confirmation }}</p></div>
      <p v-if="error" role="alert" class="rounded-md border border-[#edb8b8] bg-[#fff4f4] p-3 text-sm text-[#8b151b]">{{ error }}</p>
      <AppButton type="submit" :loading="isSubmitting">Actualizar contraseña</AppButton>
    </form>
  </section>
</template>
