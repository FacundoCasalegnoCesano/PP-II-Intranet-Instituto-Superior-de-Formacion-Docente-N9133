<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { ref } from 'vue'
import { LockKeyhole, UserRound } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import AuthLayout from '@/layouts/AuthLayout.vue'
import AppButton from '@/ui/AppButton.vue'
import { useAuthStore } from '@/stores/authStore'
import { loginSchema } from '../schemas/authSchemas'

const auth = useAuthStore()
const router = useRouter()
const formError = ref('')
const { defineField, errors, handleSubmit, isSubmitting } = useForm({ validationSchema: toTypedSchema(loginSchema) })
const [identifier, identifierAttrs] = defineField('identifier')
const [password, passwordAttrs] = defineField('password')

const submit = handleSubmit(async (values) => {
  formError.value = ''
  try {
    await auth.login(values)
    await router.replace({ name: 'home' })
  } catch {
    formError.value = 'No pudimos iniciar sesión. Revisá los datos e intentá nuevamente.'
  }
})
</script>

<template>
  <AuthLayout>
    <div class="mt-10">
      <p class="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--color-brand)]">Intranet institucional</p>
      <h1 class="mt-2 text-3xl font-semibold text-[var(--color-text)]">Bienvenido/a</h1>
      <p class="mt-2 text-[var(--color-graphite)]">Ingresá con tu correo electrónico o DNI institucional.</p>
      <form class="mt-8 space-y-5" novalidate @submit="submit">
        <div>
          <label for="identifier" class="mb-1.5 block font-semibold text-[var(--color-text)]">Correo electrónico o DNI</label>
          <div class="relative"><UserRound class="pointer-events-none absolute left-3 top-3 size-5 text-[var(--color-graphite)]" aria-hidden="true" /><input id="identifier" v-model="identifier" v-bind="identifierAttrs" autocomplete="username" class="min-h-11 w-full rounded-md border border-[var(--color-border)] bg-white py-2 pl-11 pr-3" :aria-invalid="!!errors.identifier" :aria-describedby="errors.identifier ? 'identifier-error' : undefined" /></div>
          <p v-if="errors.identifier" id="identifier-error" class="mt-1 text-sm text-[#a31118]">{{ errors.identifier }}</p>
        </div>
        <div>
          <div class="mb-1.5 flex items-center justify-between gap-3"><label for="password" class="font-semibold text-[var(--color-text)]">Contraseña</label><RouterLink :to="{ name: 'password-forgot' }" class="text-sm font-semibold text-[var(--color-brand)] hover:underline">¿Olvidaste tu contraseña?</RouterLink></div>
          <div class="relative"><LockKeyhole class="pointer-events-none absolute left-3 top-3 size-5 text-[var(--color-graphite)]" aria-hidden="true" /><input id="password" v-model="password" v-bind="passwordAttrs" type="password" autocomplete="current-password" class="min-h-11 w-full rounded-md border border-[var(--color-border)] bg-white py-2 pl-11 pr-3" :aria-invalid="!!errors.password" :aria-describedby="errors.password ? 'password-error' : undefined" /></div>
          <p v-if="errors.password" id="password-error" class="mt-1 text-sm text-[#a31118]">{{ errors.password }}</p>
        </div>
        <p v-if="formError" role="alert" class="rounded-md border border-[#edb8b8] bg-[#fff4f4] p-3 text-sm text-[#8b151b]">{{ formError }}</p>
        <AppButton type="submit" :loading="isSubmitting" class="w-full">Ingresar</AppButton>
      </form>
    </div>
  </AuthLayout>
</template>
