<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import AdminAcademicRecordsList from '../components/AdminAcademicRecordsList.vue'
import AdminAcademicRecordDetail from '../components/AdminAcademicRecordDetail.vue'
import { fetchAdminStudent, fetchAdminStudentCareers, fetchAdminStudentTrajectory, fetchAdminStudents, fetchAllAdminCareers } from '../api/adminAcademicRecordsApi'
import type { Career } from '@/modules/admin/types/admin'
import type { PaginationMeta } from '@/core/api/contracts'
import type { AdminAcademicCareerEnrollment, AdminAcademicStudent, AdminAcademicTrajectory } from '../types/adminAcademicRecords'

const route = useRoute(); const router = useRouter(); const auth = useAuthStore()
const isDetail = computed(() => route.name === 'admin-academic-record-detail')
const studentId = computed(() => Number(route.params.id))
const search = ref(''); const careerId = ref<number | undefined>(undefined)
const students = ref<AdminAcademicStudent[]>([]); const catalog = ref<Career[]>([])
const pagination = ref<PaginationMeta>({ page: 1, limit: 20, total: 0, totalPages: 0 })
const student = ref<AdminAcademicStudent | null>(null); const enrolledCareers = ref<AdminAcademicCareerEnrollment[]>([])
const selectedCareerId = ref<number | null>(null); const trajectory = ref<AdminAcademicTrajectory | null>(null)
const loading = ref(false); const error = ref('')
let listRequest = 0; let detailRequest = 0

function queryString(value: unknown): string { return Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '') }
function parsedPositive(value: unknown): number | undefined { const parsed = Number(queryString(value)); return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined }
function listQuery(): Record<string, string> {
  return { ...(search.value.trim() ? { search: search.value.trim() } : {}), ...(careerId.value ? { carreraId: String(careerId.value) } : {}), ...(pagination.value.page > 1 ? { page: String(pagination.value.page) } : {}) }
}
const routeSignature = computed(() => `${route.name}|${route.params.id ?? ''}|${route.query.search ?? ''}|${route.query.carreraId ?? ''}|${route.query.page ?? ''}|${route.query.selectedCareerId ?? ''}`)
const sessionSignature = computed(() => `${auth.status}|${auth.activeRole ?? ''}|${auth.user?.idUsuario ?? ''}`)
let disposed = false

async function loadList(): Promise<void> {
  const request = ++listRequest
  search.value = queryString(route.query.search)
  careerId.value = parsedPositive(route.query.carreraId)
  const page = parsedPositive(route.query.page) ?? 1
  loading.value = true; error.value = ''; students.value = []
  try {
    const [result, careers] = await Promise.all([fetchAdminStudents({ search: search.value.trim() || undefined, carreraId: careerId.value, page, limit: 20 }), fetchAllAdminCareers()])
    if (disposed || request !== listRequest || isDetail.value) return
    students.value = result.data; pagination.value = result.pagination; catalog.value = careers
  } catch {
    if (disposed || request !== listRequest || isDetail.value) return
    students.value = []; catalog.value = []; pagination.value = { page, limit: 20, total: 0, totalPages: 0 }; error.value = 'No pudimos cargar el listado de alumnos.'
  } finally { if (!disposed && request === listRequest && !isDetail.value) loading.value = false }
}

async function loadDetail(): Promise<void> {
  const request = ++detailRequest
  student.value = null; enrolledCareers.value = []; trajectory.value = null; selectedCareerId.value = null; loading.value = true; error.value = ''
  if (!Number.isInteger(studentId.value) || studentId.value <= 0) { loading.value = false; error.value = 'El alumno solicitado no es válido.'; return }
  try {
    const identity = await fetchAdminStudent(studentId.value)
    if (disposed || request !== detailRequest || !isDetail.value) return
    student.value = identity
    const careers = await fetchAdminStudentCareers(studentId.value)
    if (disposed || request !== detailRequest || !isDetail.value) return
    enrolledCareers.value = careers
    const requestedCareer = parsedPositive(route.query.selectedCareerId)
    selectedCareerId.value = careers.some((career) => career.carreraId === requestedCareer) ? requestedCareer! : (careers[0]?.carreraId ?? null)
    if (!selectedCareerId.value) return
    const result = await fetchAdminStudentTrajectory(studentId.value, selectedCareerId.value)
    if (disposed || request !== detailRequest || !isDetail.value) return
    trajectory.value = result
  } catch {
    if (disposed || request !== detailRequest || !isDetail.value) return
    student.value = null; enrolledCareers.value = []; trajectory.value = null; selectedCareerId.value = null; error.value = 'No pudimos cargar la identidad o la trayectoria del alumno.'
  } finally { if (!disposed && request === detailRequest && isDetail.value) loading.value = false }
}

function applyFilters(): void { void router.replace({ query: { ...listQuery(), page: undefined } }) }
function changePage(page: number): void { void router.replace({ query: { ...route.query, page: page > 1 ? String(page) : undefined } }) }
function detailListLocation(): { name: string; query: Record<string, string> } { return { name: 'admin-academic-records', query: { ...(route.query.search ? { search: queryString(route.query.search) } : {}), ...(route.query.carreraId ? { carreraId: queryString(route.query.carreraId) } : {}), ...(route.query.page ? { page: queryString(route.query.page) } : {}) } } }
async function chooseCareer(id: number): Promise<void> {
  if (!enrolledCareers.value.some((career) => career.carreraId === id)) return
  await router.replace({ query: { ...route.query, selectedCareerId: String(id) } })
}

onMounted(() => { if (isDetail.value) void loadDetail(); else void loadList() })
watch([routeSignature, sessionSignature], () => { if (isDetail.value) void loadDetail(); else void loadList() })
onBeforeUnmount(() => { disposed = true; listRequest += 1; detailRequest += 1 })
</script>

<template>
  <main class="mx-auto max-w-6xl" aria-labelledby="admin-academic-records-title">
    <div class="flex flex-wrap items-end justify-between gap-4"><div><p class="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--color-brand)]">Administración</p><h1 id="admin-academic-records-title" class="mt-2 text-3xl font-semibold">Trayectorias académicas</h1><p class="mt-2 text-[var(--color-graphite)]">Consultá el recorrido académico completo de cualquier alumno.</p></div><RouterLink v-if="isDetail" :to="detailListLocation()" class="min-h-11 rounded-lg border border-[var(--color-brand)] px-4 py-2.5 font-semibold text-[var(--color-brand)]">Volver al listado</RouterLink></div>
    <AdminAcademicRecordsList v-if="!isDetail" :students="students" :careers="catalog" :search="search" :career-id="careerId" :pagination="pagination" :loading="loading" :error="error" @update:search="search = $event" @update:career-id="careerId = $event" @apply="applyFilters" @retry="loadList" @page="changePage" />
    <AdminAcademicRecordDetail v-else :student="student" :careers="enrolledCareers" :selected-career-id="selectedCareerId" :trajectory="trajectory" :loading="loading" :error="error" @retry="loadDetail" @select-career="chooseCareer" />
  </main>
</template>
