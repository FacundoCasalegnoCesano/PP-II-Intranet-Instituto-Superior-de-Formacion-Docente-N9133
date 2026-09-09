<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { onMounted, ref } from 'vue'
import AppButton from '@/ui/AppButton.vue'
import { useFeedback } from '@/ui/feedback'
import { useAuthStore } from '@/stores/authStore'
import { fetchOwnProfile, updateOwnProfile } from '../api/profileApi'
import PasswordChangeForm from '../components/PasswordChangeForm.vue'
import { profileSchema } from '../schemas/profileSchemas'
import type { OwnProfileInput } from '../types/profile'

const auth = useAuthStore()
const feedback = useFeedback()
const loadError = ref('')
const saveError = ref('')
const ready = ref(false)
const { defineField, errors, handleSubmit, isSubmitting, resetForm } = useForm({ validationSchema: toTypedSchema(profileSchema) })
const [apellidoNombre, apellidoNombreAttrs] = defineField('apellidoNombre')
const [dni, dniAttrs] = defineField('dni')
const [email, emailAttrs] = defineField('email')
const [fechaNacimiento, fechaNacimientoAttrs] = defineField('fechaNacimiento')
const [telefono, telefonoAttrs] = defineField('telefono')
const [cuil, cuilAttrs] = defineField('cuil')
const [contactoEmergencia, contactoEmergenciaAttrs] = defineField('contactoEmergencia')
const [foto, fotoAttrs] = defineField('foto')

onMounted(async () => {
  try {
    const profile = await fetchOwnProfile()
    resetForm({ values: { apellidoNombre: profile.apellidoNombre, dni: String(profile.dni), email: profile.email, fechaNacimiento: profile.fechaNacimiento.slice(0, 10), telefono: profile.telefono, cuil: profile.cuil ?? '', contactoEmergencia: profile.contactoEmergencia ?? '', foto: profile.foto ?? '' } })
    auth.updateCurrentUser(profile)
    ready.value = true
  } catch { loadError.value = 'No pudimos cargar tu perfil. Actualizá la página para reintentar.' }
})

const submit = handleSubmit(async (values) => {
  if (!auth.user) return
  saveError.value = ''
  const payload: OwnProfileInput = { ...values, cuil: values.cuil || null, contactoEmergencia: values.contactoEmergencia || null, foto: values.foto || null }
  try {
    const profile = await updateOwnProfile(auth.user.idUsuario, payload)
    auth.updateCurrentUser(profile)
    feedback.success('Tu perfil fue actualizado.')
  } catch {
    saveError.value = 'No pudimos guardar los cambios. Revisá los datos e intentá nuevamente.'
    feedback.error('No se pudo actualizar el perfil.')
  }
})
</script>

<template>
  <main aria-labelledby="profile-title" class="mx-auto max-w-5xl">
    <p class="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--color-brand)]">Cuenta institucional</p>
    <h1 id="profile-title" class="mt-2 text-3xl font-semibold text-[var(--color-text)]">Mi perfil</h1>
    <p v-if="loadError" role="alert" class="mt-6 rounded-md border border-[#edb8b8] bg-[#fff4f4] p-4 text-[#8b151b]">{{ loadError }}</p>
    <p v-else-if="!ready" role="status" class="mt-6 rounded-lg border border-[var(--color-border)] bg-white p-5 text-[var(--color-graphite)]">Cargando tu información…</p>
    <div v-else class="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section class="rounded-lg border border-[var(--color-border)] bg-white p-5" aria-labelledby="personal-data-title">
        <h2 id="personal-data-title" class="text-xl font-semibold text-[var(--color-text)]">Datos personales</h2>
        <form class="mt-5 grid gap-4 sm:grid-cols-2" novalidate @submit="submit">
          <div class="sm:col-span-2"><label for="apellido-nombre" class="mb-1 block font-semibold">Nombre y apellido</label><input id="apellido-nombre" v-model="apellidoNombre" v-bind="apellidoNombreAttrs" autocomplete="name" class="min-h-11 w-full rounded-md border border-[var(--color-border)] px-3 py-2" :aria-invalid="!!errors.apellidoNombre" /><p v-if="errors.apellidoNombre" class="mt-1 text-sm text-[#a31118]">{{ errors.apellidoNombre }}</p></div>
          <div><label for="dni" class="mb-1 block font-semibold">DNI</label><input id="dni" v-model="dni" v-bind="dniAttrs" inputmode="numeric" class="min-h-11 w-full rounded-md border border-[var(--color-border)] px-3 py-2" :aria-invalid="!!errors.dni" /><p v-if="errors.dni" class="mt-1 text-sm text-[#a31118]">{{ errors.dni }}</p></div>
          <div><label for="cuil" class="mb-1 block font-semibold">CUIL</label><input id="cuil" v-model="cuil" v-bind="cuilAttrs" inputmode="numeric" class="min-h-11 w-full rounded-md border border-[var(--color-border)] px-3 py-2" :aria-invalid="!!errors.cuil" /><p v-if="errors.cuil" class="mt-1 text-sm text-[#a31118]">{{ errors.cuil }}</p></div>
          <div><label for="email" class="mb-1 block font-semibold">Correo electrónico</label><input id="email" v-model="email" v-bind="emailAttrs" type="email" autocomplete="email" class="min-h-11 w-full rounded-md border border-[var(--color-border)] px-3 py-2" :aria-invalid="!!errors.email" /><p v-if="errors.email" class="mt-1 text-sm text-[#a31118]">{{ errors.email }}</p></div>
          <div><label for="telefono" class="mb-1 block font-semibold">Teléfono</label><input id="telefono" v-model="telefono" v-bind="telefonoAttrs" inputmode="tel" autocomplete="tel" class="min-h-11 w-full rounded-md border border-[var(--color-border)] px-3 py-2" :aria-invalid="!!errors.telefono" /><p v-if="errors.telefono" class="mt-1 text-sm text-[#a31118]">{{ errors.telefono }}</p></div>
          <div><label for="fecha-nacimiento" class="mb-1 block font-semibold">Fecha de nacimiento</label><input id="fecha-nacimiento" v-model="fechaNacimiento" v-bind="fechaNacimientoAttrs" type="date" autocomplete="bday" class="min-h-11 w-full rounded-md border border-[var(--color-border)] px-3 py-2" :aria-invalid="!!errors.fechaNacimiento" /><p v-if="errors.fechaNacimiento" class="mt-1 text-sm text-[#a31118]">{{ errors.fechaNacimiento }}</p></div>
          <div><label for="contacto-emergencia" class="mb-1 block font-semibold">Contacto de emergencia</label><input id="contacto-emergencia" v-model="contactoEmergencia" v-bind="contactoEmergenciaAttrs" autocomplete="tel" class="min-h-11 w-full rounded-md border border-[var(--color-border)] px-3 py-2" :aria-invalid="!!errors.contactoEmergencia" /><p v-if="errors.contactoEmergencia" class="mt-1 text-sm text-[#a31118]">{{ errors.contactoEmergencia }}</p></div>
          <div class="sm:col-span-2"><label for="foto" class="mb-1 block font-semibold">URL o ruta de foto</label><input id="foto" v-model="foto" v-bind="fotoAttrs" autocomplete="url" placeholder="https://… o /imagenes/perfil.jpg" class="min-h-11 w-full rounded-md border border-[var(--color-border)] px-3 py-2" :aria-invalid="!!errors.foto" /><p v-if="errors.foto" class="mt-1 text-sm text-[#a31118]">{{ errors.foto }}</p></div>
          <p v-if="saveError" role="alert" class="sm:col-span-2 rounded-md border border-[#edb8b8] bg-[#fff4f4] p-3 text-sm text-[#8b151b]">{{ saveError }}</p>
          <div class="sm:col-span-2"><AppButton type="submit" :loading="isSubmitting">Guardar cambios</AppButton></div>
        </form>
      </section>
      <PasswordChangeForm />
    </div>
  </main>
</template>
