<script setup lang="ts">
import { ref } from 'vue'
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { Mail } from 'lucide-vue-next'
import AuthLayout from '@/layouts/AuthLayout.vue'
import AppButton from '@/ui/AppButton.vue'
import { authApi } from '../api/authApi'
import { forgotPasswordSchema } from '../schemas/authSchemas'

const sent = ref(false)
const { defineField, errors, handleSubmit, isSubmitting } = useForm({ validationSchema: toTypedSchema(forgotPasswordSchema) })
const [email, emailAttrs] = defineField('email')
const submit = handleSubmit(async (values) => {
  try { await authApi.requestPasswordReset(values.email) } finally { sent.value = true }
})
</script>

<template>
  <AuthLayout>
    <div class="mt-10">
      <RouterLink :to="{ name: 'login' }" class="text-sm font-semibold text-[var(--color-brand)] hover:underline">← Volver a ingresar</RouterLink>
      <h1 class="mt-5 text-3xl font-semibold text-[var(--color-text)]">Recuperá tu acceso</h1>
      <p class="mt-2 text-[var(--color-graphite)]">Te enviaremos instrucciones si existe una cuenta asociada a ese correo.</p>
      <p v-if="sent" role="status" class="mt-6 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">Si el correo está registrado, recibirás las instrucciones en breve.</p>
      <form v-else class="mt-8 space-y-5" novalidate @submit="submit">
        <div><label for="email" class="mb-1.5 block font-semibold">Correo electrónico</label><div class="relative"><Mail class="pointer-events-none absolute left-3 top-3 size-5 text-[var(--color-graphite)]" /><input id="email" v-model="email" v-bind="emailAttrs" autocomplete="email" class="min-h-11 w-full rounded-md border border-[var(--color-border)] py-2 pl-11 pr-3" :aria-invalid="!!errors.email" /></div><p v-if="errors.email" class="mt-1 text-sm text-[#a31118]">{{ errors.email }}</p></div>
        <AppButton type="submit" :loading="isSubmitting" class="w-full">Enviar instrucciones</AppButton>
      </form>
    </div>
  </AuthLayout>
</template>
