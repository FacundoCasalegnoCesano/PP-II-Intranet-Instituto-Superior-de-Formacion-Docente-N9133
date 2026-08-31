<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { fetchAcademicRecordCareers, fetchAcademicRecordTrajectory } from '../api/academicRecordApi'
import type { AcademicRecordCareer, AcademicRecordTrajectory } from '../types/academicRecord'
import { useAuthStore } from '@/stores/authStore'
import AppButton from '@/ui/AppButton.vue'

const auth = useAuthStore()
const careers = ref<AcademicRecordCareer[]>([])
const selectedCareerId = ref<number | null>(null)
const trajectory = ref<AcademicRecordTrajectory | null>(null)
const loading = ref(false)
const error = ref('')
const selectedCareer = computed(() => careers.value.find((career) => career.carreraId === selectedCareerId.value)?.carrera)

function date(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleDateString('es-AR') : 'Sin vencimiento informado'
}

async function load(): Promise<void> {
  if (!auth.user) return
  loading.value = true
  error.value = ''
  try {
    careers.value = (await fetchAcademicRecordCareers(auth.user.idUsuario)).filter((career) => career.activo !== false && career.carrera.activo !== false)
    selectedCareerId.value ??= careers.value[0]?.carreraId ?? null
    if (selectedCareerId.value) trajectory.value = await fetchAcademicRecordTrajectory(auth.user.idUsuario, selectedCareerId.value)
  } catch {
    trajectory.value = null
    error.value = 'No pudimos cargar tu trayectoria acadÃ©mica.'
  } finally {
    loading.value = false
  }
}

watch(selectedCareerId, (careerId, previous) => { if (careerId && careerId !== previous) void load() })
onMounted(() => { void load() })
</script>

<template>
  <main class="mx-auto max-w-5xl" aria-labelledby="academic-record-title">
    <p class="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--color-brand)]">AutogestiÃ³n acadÃ©mica</p>
    <h1 id="academic-record-title" class="mt-2 text-3xl font-semibold text-[var(--color-text)]">Mi trayectoria acadÃ©mica</h1>
    <p class="mt-2 text-[var(--color-graphite)]">ConsultÃ¡ el estado integral informado por la instituciÃ³n.</p>

    <section v-if="loading" class="mt-7 rounded-lg border border-[var(--color-border)] bg-white p-5" role="status">Cargando trayectoria acadÃ©micaâ€¦</section>
    <section v-else-if="error" class="mt-7 rounded-lg border border-[#a31118]/30 bg-[#fff7f6] p-5" role="alert"><p>{{ error }}</p><AppButton class="mt-4" variant="secondary" @click="load">Reintentar</AppButton></section>
    <section v-else-if="!careers.length" class="mt-7 rounded-lg border border-[var(--color-border)] bg-white p-5">No tenÃ©s carreras activas para consultar.</section>
    <template v-else-if="trajectory">
      <label class="mt-7 block max-w-xl font-semibold text-[var(--color-text)]">Carrera
        <select v-model.number="selectedCareerId" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-3 font-normal"><option v-for="career in careers" :key="career.id" :value="career.carreraId">{{ career.carrera.nombre }}</option></select>
      </label>
      <section class="mt-6 rounded-lg border border-[var(--color-border)] bg-white p-5" aria-labelledby="record-summary"><h2 id="record-summary" class="text-xl font-semibold">{{ selectedCareer?.nombre }}</h2><p class="mt-2 font-semibold">Promedio general: {{ trajectory.promedioGeneral ?? 'sin calificaciones definitivas' }}</p><p class="mt-1 text-sm text-[var(--color-graphite)]">{{ trajectory.cantidadMateriasAprobadas ?? 0 }} materias aprobadas</p></section>
      <ol class="mt-6 grid gap-4" aria-label="Materias de la trayectoria"><li v-for="item in trajectory.materias" :key="item.materia.id" class="rounded-lg border border-[var(--color-border)] bg-white p-5"><div class="flex flex-wrap items-start justify-between gap-3"><div><h2 class="text-lg font-semibold">{{ item.materia.nombre }}</h2><p class="mt-1 text-sm text-[var(--color-graphite)]">{{ item.plan?.anio ? `${item.plan.anio}.Âº aÃ±o` : 'AÃ±o no informado' }}</p></div><span class="rounded-full bg-[#f4e7e7] px-3 py-1 text-sm font-semibold text-[var(--color-brand)]">{{ item.estado }}</span></div><div class="mt-4 grid gap-2 text-sm sm:grid-cols-2"><p v-if="item.asistencia">Asistencia: {{ item.asistencia.porcentaje ?? 0 }}%</p><p v-if="item.regularidad">Regularidad: {{ item.regularidad.vencida ? 'vencida' : `vigente hasta ${date(item.regularidad.hasta)}` }}</p><p v-if="item.definitiva">AprobaciÃ³n: {{ item.definitiva.nota }} ({{ item.definitiva.via }})</p><p v-if="item.parcialesEfectivos?.length">Notas: {{ item.parcialesEfectivos.map((partial) => partial.nota).filter((grade) => grade !== undefined).join(', ') }}</p></div></li></ol>
    </template>
  </main>
</template>
