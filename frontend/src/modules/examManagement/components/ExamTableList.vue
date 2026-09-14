<script setup lang="ts">
import { RouterLink } from 'vue-router'
import AdminPagination from '@/modules/admin/components/AdminPagination.vue'
import AdminState from '@/modules/admin/components/AdminState.vue'
import AdminTable from '@/modules/admin/components/AdminTable.vue'
import { academicLabel } from '@/core/presentation/academicLabels'
import { examDateLabel } from '../presentation'
import { isTribunalComplete } from '../tribunalRules'
import type { ExamListItem } from '../types/exams'

const props = defineProps<{
  exams: ExamListItem[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
  loading: boolean
  error: string
  emptyText: string
  detailRouteName: string
  routeQuery?: Record<string, string | undefined>
}>()

const emit = defineEmits<{ retry: []; page: [page: number] }>()

function tribunalSummary(exam: ExamListItem): string {
  const president = exam.tribunales.find((member) => member.rolTribunal === 'PRESIDENTE')
  const vocals = exam.tribunales.filter((member) => member.rolTribunal === 'VOCAL')
  const substitute = exam.tribunales.find((member) => member.rolTribunal === 'SUPLENTE')
  return [
    president ? `Presidente: ${president.apellidoNombre}` : 'Presidente pendiente',
    `Vocales: ${vocals.length}/2`,
    ...(substitute ? [`Suplente: ${substitute.apellidoNombre}`] : []),
  ].join(' · ')
}

function tribunalComplete(exam: ExamListItem): boolean {
  return isTribunalComplete(exam.tribunales)
}

function statusClass(status: string): string {
  if (status === 'FINALIZADA') return 'bg-[#e6f1e7] text-[#245c32]'
  if (status === 'EN_PROCESO') return 'bg-amber-100 text-amber-900'
  return 'bg-[#f5eaea] text-[var(--color-brand)]'
}
</script>

<template>
  <AdminState :loading="props.loading" :error="props.error" :empty="!props.loading && !props.error && !props.exams.length" :empty-text="props.emptyText" @retry="emit('retry')">
    <AdminTable :columns="[{ key: 'subject', label: 'Materia / carrera' }, { key: 'date', label: 'Fecha y llamado' }, { key: 'tribunal', label: 'Tribunal' }, { key: 'status', label: 'Estado' }]">
      <template #rows>
        <tr v-for="exam in props.exams" :key="exam.id" class="border-t border-[var(--color-border)] align-top">
          <td class="px-4 py-4"><RouterLink :to="{ name: props.detailRouteName, params: { id: exam.id }, query: props.routeQuery }" class="font-semibold text-[var(--color-brand)]">{{ exam.materia.nombre }}</RouterLink><p class="mt-1 text-sm text-[var(--color-graphite)]">{{ exam.materia.carrera?.nombre ?? 'Carrera no informada' }}</p></td>
          <td class="px-4 py-4 text-sm"><p>{{ examDateLabel(exam.fecha) }}</p><p class="mt-1 text-[var(--color-graphite)]">{{ academicLabel(exam.tipoExamen) }} · llamado {{ exam.llamado }}</p></td>
          <td class="px-4 py-4 text-sm"><p>{{ tribunalSummary(exam) }}</p><p class="mt-1" :class="tribunalComplete(exam) ? 'text-[#245c32]' : 'text-amber-800'">{{ tribunalComplete(exam) ? 'Completo' : 'Incompleto' }}</p></td>
          <td class="px-4 py-4"><span class="rounded-full px-2.5 py-1 text-xs font-semibold" :class="statusClass(exam.estadoMesa)">{{ academicLabel(exam.estadoMesa) }}</span><p class="mt-2 text-xs text-[var(--color-graphite)]">{{ exam._count.inscripciones }} inscripto(s)</p></td>
          <td class="px-4 py-4 text-right"><RouterLink :to="{ name: props.detailRouteName, params: { id: exam.id }, query: props.routeQuery }" class="font-semibold text-[var(--color-brand)]">Ver detalle</RouterLink></td>
        </tr>
      </template>
      <template #cards>
        <article v-for="exam in props.exams" :key="exam.id" class="rounded-lg border border-[var(--color-border)] p-4">
          <RouterLink :to="{ name: props.detailRouteName, params: { id: exam.id }, query: props.routeQuery }" class="font-semibold text-[var(--color-brand)]">{{ exam.materia.nombre }}</RouterLink><p class="mt-1 text-sm text-[var(--color-graphite)]">{{ exam.materia.carrera?.nombre ?? 'Carrera no informada' }}</p><dl class="mt-3 grid gap-2 text-sm"><div><dt class="font-semibold">Fecha</dt><dd>{{ examDateLabel(exam.fecha) }}</dd></div><div><dt class="font-semibold">Tipo / llamado</dt><dd>{{ academicLabel(exam.tipoExamen) }} · llamado {{ exam.llamado }}</dd></div><div><dt class="font-semibold">Tribunal</dt><dd>{{ tribunalSummary(exam) }}</dd></div><div><dt class="font-semibold">Estado</dt><dd><span class="font-semibold">{{ academicLabel(exam.estadoMesa) }}</span> · {{ exam._count.inscripciones }} inscripto(s)</dd></div></dl><RouterLink :to="{ name: props.detailRouteName, params: { id: exam.id }, query: props.routeQuery }" class="mt-4 inline-flex min-h-11 items-center font-semibold text-[var(--color-brand)]">Ver detalle</RouterLink>
        </article>
      </template>
    </AdminTable>
    <AdminPagination :pagination="props.pagination" @change="(page) => emit('page', page)" />
  </AdminState>
</template>
