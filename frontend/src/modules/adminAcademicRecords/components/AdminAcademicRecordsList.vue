<script setup lang="ts">
import type { Career } from '@/modules/admin/types/admin'
import type { PaginationMeta } from '@/core/api/contracts'
import { useRoute } from 'vue-router'
import AdminFilters from '@/modules/admin/components/AdminFilters.vue'
import AdminPagination from '@/modules/admin/components/AdminPagination.vue'
import AdminState from '@/modules/admin/components/AdminState.vue'
import type { AdminAcademicStudent } from '../types/adminAcademicRecords'

const props = defineProps<{
  students: AdminAcademicStudent[]
  careers: Career[]
  search: string
  careerId: number | undefined
  pagination: PaginationMeta
  loading: boolean
  error: string
}>()

const emit = defineEmits<{
  'update:search': [value: string]
  'update:careerId': [value: number | undefined]
  searching: []
  apply: []
  retry: []
  page: [value: number]
}>()
const route = useRoute()

function detailQuery(student: AdminAcademicStudent): { name: string; params: { id: number }; query: Record<string, string> } {
  const appliedSearch = Array.isArray(route.query.search) ? route.query.search[0] : route.query.search
  const appliedCareerId = Array.isArray(route.query.carreraId) ? route.query.carreraId[0] : route.query.carreraId
  const appliedPage = Array.isArray(route.query.page) ? route.query.page[0] : route.query.page
  return {
    name: 'admin-academic-record-detail',
    params: { id: student.idUsuario },
    query: {
      ...(appliedSearch ? { search: String(appliedSearch) } : {}),
      ...(appliedCareerId ? { carreraId: String(appliedCareerId) } : {}),
      ...(appliedPage ? { page: String(appliedPage) } : {}),
    },
  }
}
</script>

<template>
  <AdminFilters :search="search" search-label="Alumno" placeholder="Nombre o DNI" @update:search="emit('update:search', $event)" @searching="emit('searching')" @submit="emit('apply')">
    <label class="min-w-48 text-sm font-semibold text-[var(--color-text)]">Carrera
      <select :value="careerId ?? ''" class="mt-1 min-h-11 w-full rounded-lg border border-[var(--color-border)] bg-white px-3 font-normal" @change="emit('update:careerId', ($event.target as HTMLSelectElement).value ? Number(($event.target as HTMLSelectElement).value) : undefined)">
        <option value="">Todas las carreras</option>
        <option v-for="career in careers" :key="career.id" :value="career.id">{{ career.nombre }}{{ career.activo ? '' : ' (inactiva)' }}</option>
      </select>
    </label>
  </AdminFilters>

  <div class="mt-5">
    <AdminState :loading="loading" :error="error" :empty="!loading && !error && !students.length" empty-text="No hay alumnos que coincidan con los filtros." @retry="emit('retry')">
      <div class="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
        <table class="hidden w-full text-left md:table">
          <caption class="sr-only">Alumnos y estado de sus cuentas</caption>
          <thead class="bg-[#f6f7f4] text-sm text-[var(--color-graphite)]"><tr><th scope="col" class="px-4 py-3">Alumno</th><th scope="col" class="px-4 py-3">DNI</th><th scope="col" class="px-4 py-3">Estado</th><th scope="col" class="px-4 py-3"><span class="sr-only">Acción</span></th></tr></thead>
          <tbody>
            <tr v-for="student in students" :key="student.idUsuario" class="border-t border-[var(--color-border)]">
              <td class="px-4 py-3"><RouterLink :to="detailQuery(student)" class="font-semibold text-[var(--color-brand)] hover:underline">{{ student.apellidoNombre }}</RouterLink></td>
              <td class="px-4 py-3">{{ student.dni }}</td>
              <td class="px-4 py-3"><span :class="student.activo ? 'text-emerald-800' : 'text-[var(--color-graphite)]'">{{ student.activo ? 'Activa' : 'Inactiva' }}</span></td>
              <td class="px-4 py-3 text-right"><RouterLink :to="detailQuery(student)" class="font-semibold text-[var(--color-brand)]">Ver trayectoria</RouterLink></td>
            </tr>
          </tbody>
        </table>
        <div class="grid gap-3 p-3 md:hidden">
          <article v-for="student in students" :key="student.idUsuario" class="rounded-lg border border-[var(--color-border)] p-4">
            <RouterLink :to="detailQuery(student)" class="font-semibold text-[var(--color-brand)] hover:underline">{{ student.apellidoNombre }}</RouterLink>
            <p class="mt-1 text-sm text-[var(--color-graphite)]">DNI {{ student.dni }} · {{ student.activo ? 'Cuenta activa' : 'Cuenta inactiva' }}</p>
            <RouterLink :to="detailQuery(student)" class="mt-3 inline-flex min-h-10 items-center font-semibold text-[var(--color-brand)]">Ver trayectoria</RouterLink>
          </article>
        </div>
      </div>
      <AdminPagination :pagination="pagination" @change="emit('page', $event)" />
    </AdminState>
  </div>
</template>
