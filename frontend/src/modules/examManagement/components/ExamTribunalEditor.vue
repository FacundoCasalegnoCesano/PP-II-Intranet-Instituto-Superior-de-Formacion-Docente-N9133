<script setup lang="ts">
import { computed, ref } from 'vue'
import { academicLabel } from '@/core/presentation/academicLabels'
import { isTribunalComplete } from '../tribunalRules'
import type { TeacherOption, TribunalMember, TribunalRole } from '../types/exams'

const props = defineProps<{
  members: TribunalMember[]
  teachers: TeacherOption[]
  disabled?: boolean
  saving?: boolean
}>()

const emit = defineEmits<{
  add: [payload: { profesorId: number; rolTribunal: TribunalRole }]
  remove: [member: TribunalMember]
}>()

const professorId = ref(0)
const role = ref<TribunalRole>('VOCAL')
const error = ref('')
const roles: TribunalRole[] = ['PRESIDENTE', 'VOCAL', 'SUPLENTE']

const counts = computed(() => ({
  president: props.members.filter((member) => member.rolTribunal === 'PRESIDENTE').length,
  vocal: props.members.filter((member) => member.rolTribunal === 'VOCAL').length,
  suplente: props.members.filter((member) => member.rolTribunal === 'SUPLENTE').length,
}))

const complete = computed(() => isTribunalComplete(props.members))

function add(): void {
  if (!professorId.value) { error.value = 'Seleccioná un docente.'; return }
  if (props.members.some((member) => member.profesorId === professorId.value)) { error.value = 'Una persona no puede ocupar dos cargos en la misma mesa.'; return }
  if (role.value === 'PRESIDENTE' && counts.value.president >= 1) { error.value = 'La mesa ya tiene un presidente.'; return }
  if (role.value === 'VOCAL' && counts.value.vocal >= 2) { error.value = 'La mesa ya tiene dos vocales.'; return }
  if (role.value === 'SUPLENTE' && counts.value.suplente >= 1) { error.value = 'La mesa ya tiene un suplente.'; return }
  emit('add', { profesorId: professorId.value, rolTribunal: role.value })
  professorId.value = 0
  error.value = ''
}
</script>

<template>
  <section class="rounded-xl border border-[var(--color-border)] bg-white p-5 sm:p-6" aria-labelledby="tribunal-title">
    <div class="flex flex-wrap items-start justify-between gap-3"><div><h2 id="tribunal-title" class="text-xl font-semibold">Tribunal</h2><p class="mt-1 text-sm text-[var(--color-graphite)]">Configuración progresiva: se habilita la inscripción al completar presidente y dos vocales.</p></div><span class="rounded-full px-3 py-1 text-sm font-semibold" :class="complete ? 'bg-[#e6f1e7] text-[#245c32]' : 'bg-amber-100 text-amber-900'">{{ complete ? 'Completo' : 'Incompleto' }}</span></div>
    <ul class="mt-4 grid gap-2 sm:grid-cols-2"><li v-for="member in props.members" :key="member.id ?? `${member.profesorId}-${member.rolTribunal}`" class="flex items-center justify-between gap-3 rounded-lg bg-[#f6f7f4] p-3 text-sm"><span><strong>{{ academicLabel(member.rolTribunal) }}</strong> · {{ member.apellidoNombre }}</span><button v-if="!props.disabled" type="button" class="font-semibold text-[var(--color-brand)]" @click="emit('remove', member)">Quitar</button></li></ul>
    <p v-if="!props.members.length" class="mt-3 text-sm text-[var(--color-graphite)]">Todavía no hay integrantes asignados.</p>
    <form v-if="!props.disabled" class="mt-5 grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end" @submit.prevent="add"><label class="text-sm font-semibold" for="tribunal-professor">Docente<select id="tribunal-professor" v-model.number="professorId" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-3 font-normal"><option :value="0">Seleccionar</option><option v-for="teacher in props.teachers" :key="teacher.idUsuario" :value="teacher.idUsuario">{{ teacher.apellidoNombre }}</option></select></label><label class="text-sm font-semibold" for="tribunal-role">Cargo<select id="tribunal-role" v-model="role" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-3 font-normal"><option v-for="item in roles" :key="item" :value="item">{{ academicLabel(item) }}</option></select></label><button type="submit" class="min-h-11 rounded-md bg-[var(--color-brand)] px-4 py-2 font-semibold text-white disabled:opacity-50" :disabled="props.saving">Agregar</button></form>
    <p v-if="error" class="mt-3 text-sm text-[#a31118]" role="alert">{{ error }}</p>
  </section>
</template>
