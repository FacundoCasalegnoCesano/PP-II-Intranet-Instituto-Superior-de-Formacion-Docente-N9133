<script setup lang="ts">
import { academicLabel, formatAcademicDate } from '@/core/presentation/academicLabels'
import AdminState from '@/modules/admin/components/AdminState.vue'
import type { AdminAcademicCareerEnrollment, AdminAcademicStudent, AdminAcademicTrajectory } from '../types/adminAcademicRecords'

defineProps<{
  student: AdminAcademicStudent | null
  careers: AdminAcademicCareerEnrollment[]
  selectedCareerId: number | null
  trajectory: AdminAcademicTrajectory | null
  loading: boolean
  error: string
}>()
const emit = defineEmits<{ retry: []; 'select-career': [id: number] }>()
</script>

<template>
  <AdminState :loading="loading" :error="error" :empty="!loading && !error && !student" empty-text="No encontramos el alumno solicitado." @retry="emit('retry')">
    <template v-if="student">
      <section class="rounded-xl border border-[var(--color-border)] bg-white p-5" aria-labelledby="student-identity-title">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div><p class="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--color-brand)]">Alumno/a</p><h2 id="student-identity-title" class="mt-1 text-2xl font-semibold">{{ student.apellidoNombre }}</h2></div>
          <span class="rounded-full bg-[#f4e7e7] px-3 py-1 text-sm font-semibold text-[var(--color-brand)]">{{ student.activo ? 'Cuenta activa' : 'Cuenta inactiva' }}</span>
        </div>
        <dl class="mt-4 grid gap-3 text-sm sm:grid-cols-3"><div><dt class="text-[var(--color-graphite)]">DNI</dt><dd class="font-semibold">{{ student.dni }}</dd></div><div v-if="student.email"><dt class="text-[var(--color-graphite)]">Correo</dt><dd class="font-semibold break-words">{{ student.email }}</dd></div><div v-if="student.telefono"><dt class="text-[var(--color-graphite)]">Teléfono</dt><dd class="font-semibold">{{ student.telefono }}</dd></div></dl>
      </section>

      <section class="mt-5 rounded-xl border border-[var(--color-border)] bg-white p-5" aria-labelledby="trajectory-career-title">
        <h2 id="trajectory-career-title" class="sr-only">Carrera consultada</h2>
        <label class="block max-w-xl font-semibold">Carrera consultada
          <select :value="selectedCareerId ?? ''" class="mt-1 min-h-11 w-full rounded-lg border border-[var(--color-border)] bg-white px-3 font-normal" :disabled="!careers.length" @change="emit('select-career', Number(($event.target as HTMLSelectElement).value))">
            <option v-if="!careers.length" value="">No hay inscripciones registradas</option>
            <option v-for="enrollment in careers" :key="enrollment.id ?? enrollment.carreraId" :value="enrollment.carreraId">{{ enrollment.carrera.nombre }}{{ enrollment.activo === false || enrollment.carrera.activo === false ? ' (histórica)' : '' }}</option>
          </select>
        </label>
        <p v-if="careers.length" class="mt-2 text-sm text-[var(--color-graphite)]">Se incluyen inscripciones activas e históricas.</p>
      </section>

      <AdminState v-if="careers.length" :loading="loading && !trajectory" :error="error" :empty="!loading && !error && !trajectory" empty-text="No hay trayectoria calculada para esta carrera." @retry="emit('retry')">
        <template v-if="trajectory">
          <section class="mt-5 rounded-xl border border-[var(--color-border)] bg-white p-5" aria-labelledby="trajectory-summary-title">
            <h2 id="trajectory-summary-title" class="text-xl font-semibold">{{ trajectory.carrera.nombre }}</h2>
            <div class="mt-4 grid gap-4 sm:grid-cols-2"><div><p class="text-sm text-[var(--color-graphite)]">Promedio general</p><p class="text-2xl font-semibold text-[var(--color-brand)]">{{ trajectory.promedioGeneral ?? 'Sin calificaciones definitivas' }}</p></div><div><p class="text-sm text-[var(--color-graphite)]">Materias aprobadas</p><p class="text-2xl font-semibold">{{ trajectory.cantidadMateriasAprobadas ?? 0 }}</p></div></div>
          </section>
          <section class="mt-5" aria-labelledby="subjects-title"><h2 id="subjects-title" class="text-xl font-semibold">Materias</h2><ol v-if="trajectory.materias.length" class="mt-3 grid gap-3"><li v-for="item in trajectory.materias" :key="item.materia.id" class="rounded-xl border border-[var(--color-border)] bg-white p-5"><div class="flex flex-wrap items-start justify-between gap-3"><div><h3 class="text-lg font-semibold">{{ item.materia.nombre }}</h3><p class="mt-1 text-sm text-[var(--color-graphite)]">{{ item.plan?.anio ? `${item.plan.anio}.º año` : 'Año no informado' }}</p></div><span class="rounded-full bg-[#f4e7e7] px-3 py-1 text-sm font-semibold text-[var(--color-brand)]">{{ academicLabel(item.estado) }}</span></div><dl class="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2"><div v-if="item.parcialesEfectivos?.length"><dt class="text-[var(--color-graphite)]">Notas</dt><dd class="font-semibold">{{ item.parcialesEfectivos.map((partial) => partial.nota).filter((grade) => grade !== undefined).join(', ') || 'Sin notas' }}</dd></div><div v-if="item.asistencia"><dt class="text-[var(--color-graphite)]">Asistencia</dt><dd class="font-semibold">{{ item.asistencia.porcentaje ?? 0 }}%</dd></div><div v-if="item.regularidad"><dt class="text-[var(--color-graphite)]">Regularidad</dt><dd class="font-semibold">{{ item.regularidad.vencida ? 'Vencida' : item.regularidad.hasta ? `Vigente hasta ${formatAcademicDate(item.regularidad.hasta)}` : 'Sin regularidad vigente' }}</dd></div><div v-if="item.definitiva"><dt class="text-[var(--color-graphite)]">Nota definitiva</dt><dd class="font-semibold">{{ item.definitiva.nota ?? '—' }} · {{ academicLabel(item.definitiva.via) }}</dd></div><div v-if="item.homologacion" class="sm:col-span-2"><dt class="text-[var(--color-graphite)]">Homologación</dt><dd class="font-semibold">{{ academicLabel(item.homologacion.tipo) }}{{ item.homologacion.nota != null ? ` · nota ${item.homologacion.nota}` : '' }}{{ item.homologacion.fecha ? ` · ${formatAcademicDate(item.homologacion.fecha)}` : '' }}</dd></div></dl></li></ol><p v-else class="mt-3 rounded-xl border border-dashed border-[var(--color-border)] bg-white p-6 text-[var(--color-graphite)]">No hay materias para mostrar.</p></section>
        </template>
      </AdminState>
      <p v-else class="mt-5 rounded-xl border border-dashed border-[var(--color-border)] bg-white p-6 text-[var(--color-graphite)]">El alumno no tiene inscripciones a carreras registradas.</p>
    </template>
  </AdminState>
</template>
