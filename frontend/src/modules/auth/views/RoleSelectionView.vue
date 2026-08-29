<script setup lang="ts">
import { ref } from 'vue'
import { BriefcaseBusiness, GraduationCap, ShieldCheck } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import type { Role } from '@/core/auth/contracts'
import AuthLayout from '@/layouts/AuthLayout.vue'
import AppButton from '@/ui/AppButton.vue'
import { useFeedback } from '@/ui/feedback'
import { useAuthStore } from '@/stores/authStore'

const auth = useAuthStore()
const router = useRouter()
const feedback = useFeedback()
const loadingRole = ref<Role>()
const error = ref('')
const roleDetails: Record<Role, { label: string; description: string; icon: typeof GraduationCap }> = {
  ALUMNO: { label: 'Alumno/a', description: 'Consultá tu trayectoria y tus inscripciones.', icon: GraduationCap },
  PROFESOR: { label: 'Profesor/a', description: 'Gestioná tus cursadas y actividades.', icon: BriefcaseBusiness },
  ADMINISTRATIVO: { label: 'Administrativo/a', description: 'Administrá la información institucional.', icon: ShieldCheck },
}

async function select(role: Role): Promise<void> {
  error.value = ''
  loadingRole.value = role
  try {
    await auth.selectRole(role)
    feedback.success(`Rol ${roleDetails[role].label} seleccionado.`)
    await router.replace({ name: 'home' })
  } catch {
    error.value = 'No pudimos seleccionar el rol. Intentá nuevamente.'
  } finally { loadingRole.value = undefined }
}
</script>

<template>
  <AuthLayout>
    <div class="mt-10"><p class="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--color-brand)]">Sesión iniciada</p><h1 class="mt-2 text-3xl font-semibold">¿Cómo querés ingresar?</h1><p class="mt-2 text-[var(--color-graphite)]">Elegí el rol con el que vas a trabajar en esta sesión.</p><p v-if="error" role="alert" class="mt-5 rounded-md border border-[#edb8b8] bg-[#fff4f4] p-3 text-sm text-[#8b151b]">{{ error }}</p><div class="mt-7 grid gap-3"><button v-for="role in auth.roles" :key="role" type="button" class="group flex min-h-24 items-center gap-4 rounded-lg border border-[var(--color-border)] bg-white p-4 text-left hover:border-[var(--color-brand)]" :aria-label="`Continuar como ${roleDetails[role].label}`" :disabled="!!loadingRole" @click="select(role)"><component :is="roleDetails[role].icon" class="size-7 text-[var(--color-brand)]" /><span class="flex-1"><span class="block font-semibold">{{ roleDetails[role].label }}</span><span class="mt-1 block text-sm text-[var(--color-graphite)]">{{ roleDetails[role].description }}</span></span><span v-if="loadingRole === role" class="size-4 animate-spin rounded-full border-2 border-[var(--color-brand)] border-r-transparent" aria-label="Cargando" /></button></div></div>
  </AuthLayout>
</template>
