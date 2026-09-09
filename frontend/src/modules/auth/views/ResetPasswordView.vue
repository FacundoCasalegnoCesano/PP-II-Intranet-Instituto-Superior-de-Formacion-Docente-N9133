<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { useRoute, useRouter } from 'vue-router'
import AuthLayout from '@/layouts/AuthLayout.vue'
import AppButton from '@/ui/AppButton.vue'
import { authApi } from '../api/authApi'
import { resetPasswordSchema } from '../schemas/authSchemas'

const route = useRoute()
const router = useRouter()
const token = computed(() => typeof route.query.token === 'string' ? route.query.token : '')
const tokenStatus = ref<'checking' | 'valid' | 'invalid'>('checking')
const completed = ref(false)
const { defineField, errors, handleSubmit, isSubmitting } = useForm({ validationSchema: toTypedSchema(resetPasswordSchema) })
const [password, passwordAttrs] = defineField('password')
const [confirmation, confirmationAttrs] = defineField('confirmation')

onMounted(async () => {
  if (!token.value) { tokenStatus.value = 'invalid'; return }
  try { tokenStatus.value = (await authApi.verifyResetToken(token.value)).valid ? 'valid' : 'invalid' } catch { tokenStatus.value = 'invalid' }
})

const submit = handleSubmit(async (values) => {
  if (tokenStatus.value !== 'valid') return
  try {
    await authApi.resetPassword(token.value, values.password)
    completed.value = true
  } catch { tokenStatus.value = 'invalid' }
})
</script>

<template>
  <AuthLayout>
    <div class="mt-10"><h1 class="text-3xl font-semibold text-[var(--color-text)]">Restablecé tu contraseña</h1>
      <p v-if="tokenStatus === 'checking'" role="status" class="mt-4 text-[var(--color-graphite)]">Verificando enlace seguro…</p>
      <div v-else-if="tokenStatus === 'invalid'" class="mt-5 rounded-md border border-[#edb8b8] bg-[#fff4f4] p-4"><p class="font-semibold text-[#8b151b]">Este enlace no es válido o venció.</p><RouterLink :to="{ name: 'password-forgot' }" class="mt-2 inline-block font-semibold text-[var(--color-brand)] underline">Solicitar un enlace nuevo</RouterLink></div>
      <div v-else-if="completed" class="mt-5 rounded-md border border-emerald-300 bg-emerald-50 p-4"><p class="font-semibold text-emerald-950">Tu contraseña fue actualizada.</p><RouterLink :to="{ name: 'login' }" class="mt-2 inline-block font-semibold text-[var(--color-brand)] underline">Ingresar</RouterLink></div>
      <form v-else class="mt-7 space-y-5" novalidate @submit="submit"><div><label for="new-password" class="mb-1.5 block font-semibold">Nueva contraseña</label><input id="new-password" v-model="password" v-bind="passwordAttrs" type="password" autocomplete="new-password" class="min-h-11 w-full rounded-md border border-[var(--color-border)] px-3 py-2" :aria-invalid="!!errors.password" /><p v-if="errors.password" class="mt-1 text-sm text-[#a31118]">{{ errors.password }}</p></div><div><label for="confirmation" class="mb-1.5 block font-semibold">Confirmar nueva contraseña</label><input id="confirmation" v-model="confirmation" v-bind="confirmationAttrs" type="password" autocomplete="new-password" class="min-h-11 w-full rounded-md border border-[var(--color-border)] px-3 py-2" :aria-invalid="!!errors.confirmation" /><p v-if="errors.confirmation" class="mt-1 text-sm text-[#a31118]">{{ errors.confirmation }}</p></div><AppButton type="submit" :loading="isSubmitting" class="w-full">Actualizar contraseña</AppButton></form>
    </div>
  </AuthLayout>
</template>
