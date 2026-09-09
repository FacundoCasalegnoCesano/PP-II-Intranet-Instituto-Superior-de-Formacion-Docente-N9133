<script setup lang="ts">
import { academicLabel } from '@/core/presentation/academicLabels'
import type { AcademicSummary, AcademicSummaryStudent } from '../types/teacherCourses'

defineProps<{
  summary: AcademicSummary
}>()

const pendingLabels: Record<string, string> = {
  ASISTENCIA: 'Asistencia',
  PARCIALES: 'Parciales',
  TRABAJOS_PRACTICOS: 'Trabajos prácticos',
  REGULARIDAD: 'Regularidad',
  INSTANCIA_INTEGRADORA: 'Instancia integradora',
}

function valueAsNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function formatNumber(value: number | null): string {
  return value === null ? 'Sin dato' : new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(value)
}

function recordValue(record: Record<string, unknown> | null, key: string): unknown {
  return record?.[key]
}

function attendanceText(student: AcademicSummaryStudent): string {
  if (!student.asistencia) return 'Sin clases registradas'
  const percentageValue = valueAsNumber(recordValue(student.asistencia, 'porcentaje'))
  const percentage = formatNumber(percentageValue)
  const fulfills = recordValue(student.asistencia, 'cumpleRegularidad')
  const condition = fulfills === true
    ? 'Cumple asistencia'
    : fulfills === false
      ? 'No cumple asistencia'
      : 'Condición de asistencia sin dato'
  return `${percentageValue === null ? percentage : `${percentage}%`} · ${condition}`
}

function partialsText(student: AcademicSummaryStudent): string {
  if (!student.parcialesEfectivos.length) return 'Sin parciales'
  return student.parcialesEfectivos.map(partial => (
    partial.recuperado
      ? `P${partial.numero}: ${partial.notaOriginal} → ${partial.notaEfectiva} (recuperado)`
      : `P${partial.numero}: ${partial.notaEfectiva}`
  )).join(' · ')
}

function tpsText(student: AcademicSummaryStudent): string {
  if (!student.tps) return 'Sin trabajos prácticos'
  const cargados = valueAsNumber(recordValue(student.tps, 'cargados'))
  const aprobados = valueAsNumber(recordValue(student.tps, 'aprobados'))
  const percentage = valueAsNumber(recordValue(student.tps, 'porcentaje'))
  const required = valueAsNumber(recordValue(student.tps, 'requerido'))
  const fulfills = recordValue(student.tps, 'cumple')
  const condition = fulfills === true ? 'Cumple TPs' : fulfills === false ? 'No cumple TPs' : 'Condición de TPs sin dato'
  return `${cargados ?? 0} cargados · ${aprobados ?? 0} aprobados · ${percentage === null ? 'Sin porcentaje' : `${formatNumber(percentage)}%`} · Requiere ${required === null ? 'Sin umbral' : `${formatNumber(required)}%`} · ${condition}`
}

function pendingText(student: AcademicSummaryStudent): string {
  return student.requisitosPendientes.length
    ? student.requisitosPendientes.map(requirement => pendingLabels[requirement] ?? academicLabel(requirement)).join('; ')
    : 'Ninguno'
}

function statusClass(status: string): string {
  return ['PROMOCIONADO', 'HABILITADO_PROMOCION', 'REGULAR'].includes(status)
    ? 'text-[var(--color-brand)]'
    : 'text-[var(--color-graphite)]'
}
</script>

<template>
  <section aria-labelledby="academic-summary-title" class="mt-6">
    <div>
      <h3 id="academic-summary-title" class="text-xl font-semibold">Resumen académico</h3>
      <p class="mt-1 text-sm text-[var(--color-graphite)]">Información calculada por la institución; esta vista no modifica estados académicos.</p>
    </div>

    <p v-if="!summary.alumnos.length" class="mt-5 rounded-lg border border-dashed border-[var(--color-border)] p-5 text-[var(--color-graphite)]" role="status">No hay alumnos para resumir.</p>
    <div v-else class="mt-5 overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
      <table class="w-full min-w-[76rem] border-collapse text-left text-sm" aria-label="Resumen académico">
        <caption class="sr-only">Resumen académico calculado de la cursada</caption>
        <thead>
          <tr class="border-b border-[var(--color-border)] text-[var(--color-graphite)]">
            <th scope="col" class="px-3 py-3 font-semibold">Alumno</th>
            <th scope="col" class="px-3 py-3 font-semibold">Asistencia</th>
            <th scope="col" class="px-3 py-3 font-semibold">Parciales efectivos</th>
            <th scope="col" class="px-3 py-3 font-semibold">Trabajos prácticos</th>
            <th scope="col" class="px-3 py-3 font-semibold">Promedio</th>
            <th scope="col" class="px-3 py-3 font-semibold">Nota mínima</th>
            <th scope="col" class="px-3 py-3 font-semibold">Estado</th>
            <th scope="col" class="px-3 py-3 font-semibold">Requisitos pendientes</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="student in summary.alumnos" :key="student.alumno.alumnoId" class="border-b border-[var(--color-border)] align-top last:border-b-0">
            <th scope="row" class="px-3 py-4 font-semibold">{{ student.alumno.apellidoNombre }}<span class="mt-1 block font-normal text-[var(--color-graphite)]">DNI {{ student.alumno.dni }}</span></th>
            <td class="px-3 py-4">{{ attendanceText(student) }}</td>
            <td class="px-3 py-4">{{ partialsText(student) }}</td>
            <td class="px-3 py-4">{{ tpsText(student) }}</td>
            <td class="px-3 py-4">{{ formatNumber(student.promedio) }}</td>
            <td class="px-3 py-4">{{ formatNumber(student.notaMinima) }}</td>
            <td class="px-3 py-4"><span :class="statusClass(student.estado)">{{ academicLabel(student.estado) }}</span></td>
            <td class="px-3 py-4">{{ pendingText(student) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
