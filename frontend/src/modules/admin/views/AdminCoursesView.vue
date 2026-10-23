<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AdminPagination from '../components/AdminPagination.vue'
import AdminState from '../components/AdminState.vue'
import AdminTable from '../components/AdminTable.vue'
import { adminApi } from '../api/adminApi'
import { courseSchema, spaceCourseSchema } from '../schemas/adminSchemas'
import type { ActiveStudent, Career, CourseOffering, Subject } from '../types/admin'
import { useFeedback } from '@/ui/feedback'
import { academicLabel } from '@/core/presentation/academicLabels'
import { spacesApi, type CurriculumSpace } from '@/modules/spaces/api/spacesApi'
import type { SpaceCourseOffering } from '../types/admin'

const route = useRoute()
const router = useRouter()
const feedback = useFeedback()
const courses = ref<CourseOffering[]>([])
const spaceCourses = ref<SpaceCourseOffering[]>([])
const subjects = ref<Subject[]>([])
const careers = ref<Career[]>([])
const curriculumSpaces = ref<CurriculumSpace[]>([])
const teachers = ref<Array<{ idUsuario: number; apellidoNombre: string }>>([])
const selected = ref<CourseOffering | SpaceCourseOffering | null>(null)
const loading = ref(false)
const error = ref('')
const saving = ref(false)
const editLoading = ref(false)
const editError = ref('')
const optionsReady = ref(false)
const optionsLoading = ref(false)
const optionsError = ref('')
const deactivating = ref(false)
const pagination = ref({ page: 1, limit: 20, total: 0, totalPages: 0 })
const spacePagination = ref({ page: 1, limit: 20, total: 0, totalPages: 0 })
const yearFilter = ref(String(route.query.anioLectivo ?? ''))
const form = reactive<Record<string, any>>({ materiaId: 0, anioLectivo: new Date().getFullYear(), periodo: 'ANUAL', docenteId: null })
const unitType = ref<'MATERIA' | 'ESPACIO'>(route.query.tipo === 'ESPACIO' ? 'ESPACIO' : 'MATERIA')
const spaceCareerId = ref<number | null>(null)
const spaceId = ref<number | null>(null)
const spaceComponentSettings = ref<Array<{ materiaId: number; docenteId: number | null; periodo: string }>>([])
const fieldError = ref('')
const historicStudentSearch = ref('')
const historicStudents = ref<ActiveStudent[]>([])
const historicStudentId = ref('')
const historicStudentLoading = ref(false)
const historicEnrollSaving = ref(false)
const historicEnrollMessage = ref('')
const historicEnrollError = ref('')
let historicStudentRequest = 0
let historicStudentTimer: ReturnType<typeof setTimeout> | null = null
let listRequest = 0
let detailRequest = 0
let editRequest = 0
let optionsRequest = 0
let disposed = false

const mode = computed(() => String(route.name))
const isSpaceRoute = computed(() => route.query.tipo === 'ESPACIO')
const selectedSpace = computed(() => selected.value && 'espacioCurricular' in selected.value ? selected.value : null)
const selectedMatter = computed(() => selected.value && 'materia' in selected.value ? selected.value : null)
const isList = computed(() => mode.value === 'admin-courses')
const isDetail = computed(() => mode.value === 'admin-course-detail')
const id = computed(() => Number(route.params.id))
const selectedCourseFinalized = computed(() => selected.value?.estadoCursada === 'FINALIZADA')

function courseStatusLabel(status: CourseOffering['estadoCursada']): string {
  return status === 'FINALIZADA' ? 'Finalizada' : academicLabel(status ?? 'ACTIVA')
}

async function searchAllActiveStudents(search: string, request: number): Promise<ActiveStudent[]> {
  const limit = 100
  const first = await adminApi.listActiveStudents(search, { page: 1, limit })
  const students = [...first.data]
  for (let page = 2; page <= first.pagination.totalPages; page += 1) {
    if (disposed || request !== historicStudentRequest) return []
    const next = await adminApi.listActiveStudents(search, { page, limit })
    if (next.pagination.page !== page || next.pagination.total !== first.pagination.total
      || next.pagination.totalPages !== first.pagination.totalPages) throw new Error('La búsqueda de alumnos no devolvió una paginación válida.')
    students.push(...next.data)
  }
  if (students.length !== first.pagination.total) throw new Error('La búsqueda de alumnos está incompleta.')
  return students
}

async function loadOptions(request = ++optionsRequest, targetRoute = route.fullPath): Promise<boolean> {
  optionsLoading.value = true
  optionsError.value = ''
  try {
    const [subjectResult, userResult, spaceResult, careerResult] = await Promise.all([adminApi.listSubjects({ limit: 100 }), adminApi.listUsers({ rol: 'PROFESOR', limit: 100 }), spacesApi.list(), adminApi.listCareers({ limit: 100 })])
    if (disposed || request !== optionsRequest || route.fullPath !== targetRoute) return false
    subjects.value = subjectResult.data
    teachers.value = userResult.data.map((user) => ({ idUsuario: user.idUsuario, apellidoNombre: user.apellidoNombre }))
    curriculumSpaces.value = spaceResult.filter((space) => space.activo)
    careers.value = careerResult.data
    optionsReady.value = true
    return true
  } catch {
    if (!disposed && request === optionsRequest && route.fullPath === targetRoute) optionsError.value = 'No pudimos cargar las materias y docentes.'
    return false
  } finally {
    if (!disposed && request === optionsRequest && route.fullPath === targetRoute) optionsLoading.value = false
  }
}

async function loadList(): Promise<void> {
  const request = ++listRequest
  const targetRoute = route.fullPath
  loading.value = true
  error.value = ''
  try {
    const [result, spaces] = await Promise.all([adminApi.listCourses({ anioLectivo: yearFilter.value ? Number(yearFilter.value) : undefined, page: Number(route.query.page ?? 1), limit: 20 }), adminApi.listSpaceCourses({ anioLectivo: yearFilter.value ? Number(yearFilter.value) : undefined, page: Number(route.query.pageEspacios ?? 1), limit: 20 })])
    if (disposed || request !== listRequest || route.fullPath !== targetRoute || !isList.value) return
    courses.value = result.data
    spaceCourses.value = spaces.data
    spacePagination.value = spaces.pagination
    pagination.value = result.pagination
  } catch {
    if (!disposed && request === listRequest && route.fullPath === targetRoute && isList.value) error.value = 'No pudimos cargar las cursadas.'
  } finally {
    if (!disposed && request === listRequest && route.fullPath === targetRoute) loading.value = false
  }
}

async function loadDetail(): Promise<void> {
  const request = ++detailRequest
  const targetRoute = route.fullPath
  loading.value = true
  selected.value = null
  error.value = ''
  try {
    const result = isSpaceRoute.value ? await adminApi.getSpaceCourse(id.value) : await adminApi.getCourse(id.value)
    if (disposed || request !== detailRequest || route.fullPath !== targetRoute || !isDetail.value) return
    selected.value = result
  } catch {
    if (!disposed && request === detailRequest && route.fullPath === targetRoute && isDetail.value) error.value = 'No pudimos cargar la cursada.'
  } finally {
    if (!disposed && request === detailRequest && route.fullPath === targetRoute) loading.value = false
  }
}

function searchHistoricStudents(): void {
  if (historicStudentTimer) clearTimeout(historicStudentTimer)
  const request = ++historicStudentRequest
  historicStudents.value = []
  historicStudentId.value = ''
  historicEnrollError.value = ''
  const search = historicStudentSearch.value.trim()
  if (search.length < 2 || !selectedCourseFinalized.value) { historicStudentLoading.value = false; return }
  historicStudentLoading.value = true
  historicStudentTimer = setTimeout(async () => {
    historicStudentTimer = null
    try {
      const result = await searchAllActiveStudents(search, request)
      if (!disposed && request === historicStudentRequest && search === historicStudentSearch.value.trim()) historicStudents.value = result.filter(student => student.activo)
    } catch (cause) {
      if (!disposed && request === historicStudentRequest) historicEnrollError.value = cause instanceof Error ? cause.message : 'No pudimos buscar alumnos.'
    } finally { if (!disposed && request === historicStudentRequest) historicStudentLoading.value = false }
  }, 300)
}

async function enrollStudentInFinalizedCourse(): Promise<void> {
  const course = selected.value
  const alumnoId = Number(historicStudentId.value)
  if (!course || course.estadoCursada !== 'FINALIZADA' || !Number.isInteger(alumnoId) || alumnoId < 1 || historicEnrollSaving.value) return
  historicEnrollSaving.value = true
  historicEnrollError.value = ''
  historicEnrollMessage.value = ''
  try {
    const result = 'espacioCurricular' in course
      ? await adminApi.enrollHistoricalSpaceCourse(course.id, alumnoId)
      : await adminApi.enrollHistoricalCourse(course.id, alumnoId)
    historicEnrollMessage.value = result.message ?? `Se inscribió a ${historicStudents.value.find(student => student.idUsuario === alumnoId)?.apellidoNombre ?? 'el alumno'} en la cursada.`
    historicStudentSearch.value = ''; historicStudentId.value = ''; historicStudents.value = []
  } catch (cause) {
    historicEnrollError.value = cause instanceof Error && cause.message ? cause.message : 'No se pudo inscribir al alumno en la cursada histórica.'
  } finally { historicEnrollSaving.value = false }
}

function reset(): void {
  Object.assign(form, { materiaId: 0, anioLectivo: new Date().getFullYear(), periodo: 'ANUAL', docenteId: null })
  fieldError.value = ''
  spaceCareerId.value = null; spaceId.value = null; spaceComponentSettings.value = []
  unitType.value = route.query.tipo === 'ESPACIO' ? 'ESPACIO' : 'MATERIA'
}

function selectSpace(id: number | null): void {
  spaceId.value = id
  const space = curriculumSpaces.value.find((item) => item.id === id)
  spaceCareerId.value = space?.carreraId ?? null
  spaceComponentSettings.value = space?.materias.map((materia) => ({ materiaId: materia.id, docenteId: null, periodo: (materia as typeof materia & { periodo?: string | null }).periodo ?? '' })) ?? []
}

async function loadEdit(): Promise<void> {
  const request = ++editRequest
  const targetRoute = route.fullPath
  editLoading.value = true
  editError.value = ''
  optionsReady.value = false
  selected.value = null
  reset()
  const loadedOptions = await loadOptions(++optionsRequest, targetRoute)
  if (!loadedOptions || disposed || request !== editRequest || route.fullPath !== targetRoute || !isEdit.value) {
    if (!loadedOptions && request === editRequest && route.fullPath === targetRoute) editError.value = optionsError.value || 'No pudimos cargar los datos para editar.'
    if (!disposed && request === editRequest && route.fullPath === targetRoute) editLoading.value = false
    return
  }
  try {
    const course = isSpaceRoute.value ? await adminApi.getSpaceCourse(id.value) : await adminApi.getCourse(id.value)
    if (disposed || request !== editRequest || route.fullPath !== targetRoute || !isEdit.value) return
    selected.value = course
    if ('espacioCurricular' in course) {
      unitType.value = 'ESPACIO'
      Object.assign(form, { anioLectivo: course.anioLectivo, periodo: course.periodo ?? 'ANUAL' })
      selectSpace(course.espacioCurricularId)
      spaceComponentSettings.value = course.componentes.map((component) => ({ materiaId: component.materiaId, docenteId: component.docenteId ?? null, periodo: component.periodo ?? (curriculumSpaces.value.find((item) => item.id === course.espacioCurricularId)?.materias.find((materia) => materia.id === component.materiaId) as { periodo?: string | null } | undefined)?.periodo ?? '' }))
    } else Object.assign(form, { materiaId: course.materiaId ?? course.materia.id, anioLectivo: course.anioLectivo, periodo: course.periodo, docenteId: course.docenteId ?? null })
  } catch {
    if (!disposed && request === editRequest && route.fullPath === targetRoute && isEdit.value) editError.value = 'No pudimos cargar la cursada para editar.'
  } finally {
    if (!disposed && request === editRequest && route.fullPath === targetRoute) editLoading.value = false
  }
}

async function save(): Promise<void> {
  if (saving.value || !optionsReady.value || (isEdit.value && (!selected.value || editLoading.value || editError.value))) return
  fieldError.value = ''
  const result = courseSchema.safeParse(form)
  if (unitType.value === 'ESPACIO') {
    if (!spaceId.value || !spaceCareerId.value || spaceComponentSettings.value.length < 2) { fieldError.value = 'Elegí un espacio curricular con componentes disponibles.'; return }
    const spaceResult = spaceCourseSchema.safeParse(form)
    if (!spaceResult.success) { fieldError.value = spaceResult.error.issues[0]?.message ?? 'Revisá el año y período de la cursada.'; return }
    saving.value = true
    try {
      const payload = { componentes: spaceComponentSettings.value.map(({ materiaId, docenteId, periodo }) => ({ materiaId, docenteId, ...(periodo ? { periodo } : {}) })) }
      if (isEdit.value) await adminApi.updateSpaceCourse(id.value, payload)
      else await adminApi.createSpaceCourse({ espacioCurricularId: spaceId.value, ...spaceResult.data, ...payload })
      feedback.success(isEdit.value ? 'Cursada de espacio actualizada.' : 'Cursada de espacio creada.'); await router.replace({ name: 'admin-courses' })
    } catch (cause) { feedback.error(cause instanceof Error && cause.message ? cause.message : 'No se pudo crear la cursada de espacio.') }
    finally { saving.value = false }
    return
  }
  if (!result.success) { fieldError.value = result.error.issues[0]?.message ?? 'Revisá los datos.'; return }
  saving.value = true
  try {
    if (mode.value === 'admin-course-create') await adminApi.createCourse(result.data)
    else await adminApi.updateCourse(id.value, result.data)
    feedback.success(mode.value === 'admin-course-create' ? 'Cursada creada.' : 'Cursada actualizada.')
    await router.replace({ name: 'admin-courses' })
  } catch { feedback.error('No se pudo guardar la cursada.') } finally { saving.value = false }
}

async function deactivate(): Promise<void> {
  if (!selected.value || deactivating.value) return
  const course = selected.value
  const name = 'espacioCurricular' in course ? course.espacioCurricular.nombre : course.materia?.nombre ?? 'esta materia'
  if (!window.confirm(`¿Desactivar ${name} · ciclo ${course.anioLectivo} (${academicLabel(course.periodo ?? 'ANUAL')})?`)) return
  deactivating.value = true
  try { if ('espacioCurricular' in course) await adminApi.deactivateSpaceCourse(course.id); else await adminApi.deactivateCourse(course.id); feedback.success('Cursada desactivada.'); await router.replace({ name: 'admin-courses' }) } catch (cause) { feedback.error(cause instanceof Error && cause.message ? cause.message : 'No se pudo desactivar la cursada.') } finally { deactivating.value = false }
}

const isEdit = computed(() => mode.value === 'admin-course-edit')
const commonCourseSubjects = computed(() => {
  if (isEdit.value) return subjects.value
  const spaceSubjectIds = new Set(curriculumSpaces.value.flatMap((space) => space.materias.map((subject) => subject.id)))
  return subjects.value.filter((subject) => !spaceSubjectIds.has(subject.id))
})
function enterRoute(): void {
  ++listRequest; ++detailRequest; ++editRequest; ++optionsRequest
  loading.value = false; error.value = ''; selected.value = null
  if (isList.value) void loadList()
  else if (isDetail.value) void loadDetail()
  else if (isEdit.value) void loadEdit()
  else { void loadOptions(); reset() }
}
onMounted(enterRoute)
watch(() => route.fullPath, enterRoute)
onBeforeUnmount(() => { disposed = true; ++listRequest; ++detailRequest; ++editRequest; ++optionsRequest; ++historicStudentRequest; if (historicStudentTimer) clearTimeout(historicStudentTimer) })
</script>

<template>
  <main aria-labelledby="admin-courses-title" class="mx-auto max-w-6xl">
    <div class="flex flex-wrap items-end justify-between gap-4"><div><p class="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--color-brand)]">Administración</p><h1 id="admin-courses-title" class="mt-2 text-3xl font-semibold">Cursadas</h1></div><div v-if="isList" class="flex flex-wrap gap-2"><RouterLink :to="{ name: 'admin-course-grades' }" class="inline-flex min-h-11 items-center rounded-lg border border-[var(--color-brand)] px-4 py-2.5 font-semibold text-[var(--color-brand)]">Cargar calificaciones</RouterLink><RouterLink :to="{ name: 'admin-course-create' }" class="inline-flex min-h-11 items-center rounded-lg border border-[var(--color-brand)] px-4 py-2.5 font-semibold text-[var(--color-brand)]">Nueva cursada de materia</RouterLink><RouterLink :to="{ name: 'admin-course-create', query: { tipo: 'ESPACIO' } }" class="inline-flex min-h-11 items-center rounded-lg bg-[var(--color-brand)] px-4 py-2.5 font-semibold text-white">Nueva cursada de espacio</RouterLink></div></div>
    <template v-if="isList"><form class="mt-6 flex max-w-md items-end gap-3 rounded-xl border border-[var(--color-border)] bg-white p-4" @submit.prevent="router.replace({ query: { anioLectivo: yearFilter || undefined, page: undefined } }).then(loadList)"><label class="flex-1 text-sm font-semibold">Año lectivo<input v-model="yearFilter" inputmode="numeric" class="admin-input" /></label><button class="min-h-11 rounded-lg bg-[var(--color-brand)] px-4 font-semibold text-white">Aplicar</button></form><div class="mt-5"><AdminState :loading="loading" :error="error" :empty="!loading && !error && !courses.length && !spaceCourses.length" empty-text="No hay cursadas para mostrar." @retry="loadList"><AdminTable :columns="[{ key: 'subject', label: 'Materia' }, { key: 'year', label: 'Año' }, { key: 'teacher', label: 'Docente' }, { key: 'status', label: 'Estado' }]"><template #rows><tr v-for="course in courses" :key="`materia-${course.id}`" class="border-t border-[var(--color-border)]"><td class="px-4 py-3"><RouterLink :to="{ name: 'admin-course-detail', params: { id: course.id } }" class="font-semibold text-[var(--color-brand)]">{{ course.materia?.nombre ?? '—' }}</RouterLink></td><td class="px-4 py-3">{{ course.anioLectivo }}</td><td class="px-4 py-3">{{ course.docente?.apellidoNombre ?? 'Sin asignar' }}</td><td class="px-4 py-3">Materia · {{ courseStatusLabel(course.estadoCursada ?? (course.activo ? 'ACTIVA' : 'INACTIVA')) }}</td><td class="px-4 py-3 text-right"><RouterLink :to="{ name: 'admin-course-edit', params: { id: course.id } }" class="font-semibold text-[var(--color-brand)]">Editar</RouterLink></td></tr><tr v-for="course in spaceCourses" :key="`espacio-${course.id}`" class="border-t border-[var(--color-border)]"><td class="px-4 py-3"><RouterLink :to="{ name: 'admin-course-detail', params: { id: course.id }, query: { tipo: 'ESPACIO' } }" class="font-semibold text-[var(--color-brand)]">{{ course.espacioCurricular.nombre }}</RouterLink><span class="block text-xs">Espacio curricular · {{ course.componentes.map((item) => item.materia.nombre).join(' · ') }}</span></td><td class="px-4 py-3">{{ course.anioLectivo }} · {{ academicLabel(course.periodo ?? 'ANUAL') }}</td><td class="px-4 py-3">{{ course.componentes.map((item) => item.docente?.apellidoNombre ?? 'Sin asignar').join(' · ') }}</td><td class="px-4 py-3">{{ courseStatusLabel(course.estadoCursada ?? (course.activo ? 'ACTIVA' : 'INACTIVA')) }}</td><td class="px-4 py-3 text-right"><RouterLink :to="{ name: 'admin-course-edit', params: { id: course.id }, query: { tipo: 'ESPACIO' } }" class="font-semibold text-[var(--color-brand)]">Editar</RouterLink></td></tr></template><template #cards><article v-for="course in courses" :key="`materia-${course.id}`" class="rounded-lg border border-[var(--color-border)] p-4"><RouterLink :to="{ name: 'admin-course-detail', params: { id: course.id } }" class="font-semibold text-[var(--color-brand)]">{{ course.materia?.nombre ?? '—' }}</RouterLink><p class="text-sm text-[var(--color-graphite)]">{{ course.anioLectivo }} · {{ course.docente?.apellidoNombre ?? 'Sin asignar' }} · {{ courseStatusLabel(course.estadoCursada ?? (course.activo ? 'ACTIVA' : 'INACTIVA')) }}</p></article><article v-for="course in spaceCourses" :key="`espacio-${course.id}`" class="rounded-lg border border-[var(--color-border)] p-4"><RouterLink :to="{ name: 'admin-course-detail', params: { id: course.id }, query: { tipo: 'ESPACIO' } }" class="font-semibold">Espacio curricular · {{ course.espacioCurricular.nombre }}</RouterLink><p class="text-sm text-[var(--color-graphite)]">{{ course.anioLectivo }} · {{ academicLabel(course.periodo ?? 'ANUAL') }} · {{ courseStatusLabel(course.estadoCursada ?? (course.activo ? 'ACTIVA' : 'INACTIVA')) }}</p><ul class="mt-2 text-sm"><li v-for="component in course.componentes" :key="component.cursadaId">{{ component.materia.nombre }} · {{ component.docente?.apellidoNombre ?? 'Sin asignar' }}</li></ul><RouterLink :to="{ name: 'admin-course-edit', params: { id: course.id }, query: { tipo: 'ESPACIO' } }" class="mt-3 inline-block font-semibold text-[var(--color-brand)]">Editar</RouterLink></article></template></AdminTable><AdminPagination :pagination="pagination" @change="(page) => router.replace({ query: { ...route.query, page: String(page) } }).then(loadList)" /></AdminState><AdminPagination v-if="spacePagination.totalPages > 1" :pagination="spacePagination" @change="(page) => router.replace({ query: { ...route.query, pageEspacios: String(page) } }).then(loadList)" /><p v-if="spacePagination.total" class="mt-3 text-sm text-[var(--color-graphite)]">Cursadas de espacios: página {{ spacePagination.page }} de {{ spacePagination.totalPages }} ({{ spacePagination.total }} ofertas).</p></div></template>
    <template v-else-if="isDetail"><AdminState :loading="loading" :error="error" @retry="loadDetail"><section v-if="selected" class="mt-7 rounded-xl border border-[var(--color-border)] bg-white p-6"><div class="flex items-start justify-between gap-4"><div><h2 class="text-2xl font-semibold">{{ selectedSpace?.espacioCurricular.nombre ?? selectedMatter?.materia.nombre }}</h2><p class="text-[var(--color-graphite)]">{{ selected.anioLectivo }} · {{ academicLabel(selected.periodo ?? 'ANUAL') }} · {{ courseStatusLabel(selected.estadoCursada ?? (selected.activo ? 'ACTIVA' : 'INACTIVA')) }}<span v-if="selectedSpace"> · Espacio curricular</span></p></div><div class="flex gap-2"><RouterLink :to="{ name: 'admin-course-edit', params: { id: selected.id }, query: isSpaceRoute ? { tipo: 'ESPACIO' } : {} }" class="min-h-10 rounded-lg bg-[var(--color-brand)] px-4 py-2 font-semibold text-white">Editar</RouterLink><button type="button" class="min-h-10 rounded-lg border border-[var(--color-border)] px-4 py-2" :disabled="deactivating" @click="deactivate">{{ deactivating ? 'Desactivando…' : 'Desactivar' }}</button></div></div><ul v-if="selectedSpace" class="mt-5 grid gap-2"><li v-for="component in selectedSpace.componentes" :key="component.cursadaId" class="rounded-lg bg-[#f6f7f4] p-3">{{ component.materia.nombre }} · {{ component.docente?.apellidoNombre ?? 'Sin asignar' }} · {{ academicLabel(component.periodo ?? selectedSpace.periodo ?? 'ANUAL') }}</li></ul><p v-else class="text-[var(--color-graphite)]">{{ selectedMatter?.docente?.apellidoNombre ?? 'Sin docente' }}</p><section v-if="selectedCourseFinalized" class="mt-6 rounded-lg border border-[var(--color-border)] bg-[#f6f7f4] p-4" aria-labelledby="historical-enroll-title"><h3 id="historical-enroll-title" class="font-semibold">Inscribir alumno</h3><p class="mt-1 text-sm text-[var(--color-graphite)]">Buscá por nombre o DNI para agregar una matrícula a esta cursada.</p><form class="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]" @submit.prevent="enrollStudentInFinalizedCourse"><label class="text-sm font-semibold">Buscar alumno<input v-model="historicStudentSearch" type="search" class="admin-input" autocomplete="off" placeholder="Nombre o DNI" @input="searchHistoricStudents" /></label><label class="text-sm font-semibold">Alumno<select v-model="historicStudentId" class="admin-input" :disabled="historicStudentLoading"><option value="">{{ historicStudentLoading ? 'Buscando…' : historicStudentSearch.trim().length < 2 ? 'Buscá primero por nombre o DNI' : historicStudents.length ? 'Seleccioná un alumno' : 'No se encontraron alumnos' }}</option><option v-for="student in historicStudents" :key="student.idUsuario" :value="String(student.idUsuario)">{{ student.apellidoNombre }} · DNI {{ student.dni }}</option></select></label><button type="submit" class="min-h-11 self-end rounded-lg bg-[var(--color-brand)] px-4 font-semibold text-white" :disabled="historicEnrollSaving || !historicStudentId">{{ historicEnrollSaving ? 'Inscribiendo…' : 'Inscribir alumno' }}</button></form><p v-if="historicEnrollError" class="mt-3 text-sm text-red-800" role="alert">{{ historicEnrollError }}</p><p v-if="historicEnrollMessage" class="mt-3 text-sm" role="status">{{ historicEnrollMessage }}</p></section><div v-if="!selectedSpace" class="mt-8 rounded-lg bg-[#f6f7f4] p-4"><h3 class="text-xl font-semibold">Horarios oficiales</h3><p class="mt-1 text-sm text-[var(--color-graphite)]">Consultá o publicá el PDF oficial de horarios desde la sección centralizada.</p><RouterLink :to="{ name: 'schedules' }" class="mt-3 inline-flex min-h-10 items-center rounded-lg border border-[var(--color-brand)] px-4 py-2 font-semibold text-[var(--color-brand)]">Horarios oficiales</RouterLink></div></section></AdminState></template>
    <template v-else><section class="mt-7 max-w-3xl rounded-xl border border-[var(--color-border)] bg-white p-6"><h2 class="text-2xl font-semibold">{{ mode === 'admin-course-create' ? 'Nueva cursada' : 'Editar cursada' }}</h2><div v-if="isEdit && editLoading" role="status" aria-busy="true" class="mt-4">Cargando datos de la cursada…</div><div v-else-if="isEdit && editError" class="mt-4" role="alert"><p>{{ editError }}</p><button type="button" class="mt-3 min-h-10 rounded-lg border border-[var(--color-border)] px-4" @click="loadEdit">Reintentar</button></div><div v-else-if="optionsLoading" role="status" aria-busy="true" class="mt-4">Cargando materias y docentes…</div><div v-else-if="optionsError" class="mt-4" role="alert"><p>{{ optionsError }}</p><button type="button" class="mt-3 min-h-10 rounded-lg border border-[var(--color-border)] px-4" @click="loadOptions()">Reintentar</button></div><form v-else-if="optionsReady && (!isEdit || selected)" class="mt-5 grid gap-4 sm:grid-cols-2" @submit.prevent="save"><label v-if="!isEdit" class="font-semibold sm:col-span-2">Unidad académica<select v-model="unitType" class="admin-input"><option value="MATERIA">Materia</option><option value="ESPACIO">Espacio curricular</option></select></label><template v-if="unitType === 'MATERIA'"><label class="font-semibold sm:col-span-2">Materia<select v-model.number="form.materiaId" class="admin-input"><option :value="0">Seleccionar</option><option v-for="subject in commonCourseSubjects" :key="subject.id" :value="subject.id">{{ subject.nombre }} · {{ subject.carrera?.nombre }}</option></select></label><label class="font-semibold sm:col-span-2">Docente<select v-model="form.docenteId" class="admin-input"><option :value="null">Sin asignar</option><option v-for="teacher in teachers" :key="teacher.idUsuario" :value="teacher.idUsuario">{{ teacher.apellidoNombre }}</option></select></label></template><template v-else><label class="font-semibold">Carrera<select v-model.number="spaceCareerId" :disabled="isEdit" class="admin-input" @change="spaceId = null; spaceComponentSettings = []"><option :value="null">Seleccionar carrera</option><option v-for="career in careers" :key="career.id" :value="career.id">{{ career.nombre }}</option></select></label><label class="font-semibold">Espacio curricular<select :value="spaceId ?? ''" class="admin-input" :disabled="!spaceCareerId || isEdit" @change="selectSpace(($event.target as HTMLSelectElement).value ? Number(($event.target as HTMLSelectElement).value) : null)"><option value="">Seleccionar</option><option v-for="space in curriculumSpaces.filter((item) => item.carreraId === spaceCareerId)" :key="space.id" :value="space.id">{{ space.nombre }}</option></select></label><fieldset v-if="spaceComponentSettings.length" class="sm:col-span-2 rounded-lg border border-[var(--color-border)] p-4"><legend class="px-1 font-semibold">Docentes y períodos por componente</legend><div v-for="component in spaceComponentSettings" :key="component.materiaId" class="grid gap-3 border-t border-[var(--color-border)] py-3 sm:grid-cols-2"><p class="font-semibold sm:col-span-2">{{ curriculumSpaces.find((item) => item.id === spaceId)?.materias.find((item) => item.id === component.materiaId)?.nombre }}</p><label>Docente<select v-model="component.docenteId" class="admin-input"><option :value="null">Sin asignar</option><option v-for="teacher in teachers" :key="teacher.idUsuario" :value="teacher.idUsuario">{{ teacher.apellidoNombre }}</option></select></label><label>Período<select v-model="component.periodo" class="admin-input"><option value="">Usar el período de la materia</option><option value="ANUAL">Anual</option><option value="PRIMER_CUATRIMESTRE">Primer cuatrimestre</option><option value="SEGUNDO_CUATRIMESTRE">Segundo cuatrimestre</option></select></label></div></fieldset></template><label class="font-semibold">Año lectivo<input v-model.number="form.anioLectivo" type="number" min="2000" max="2100" :disabled="isEdit && unitType === 'ESPACIO'" class="admin-input" /></label><label class="font-semibold">Período de la cursada<select v-model="form.periodo" :disabled="isEdit && unitType === 'ESPACIO'" class="admin-input"><option value="ANUAL">{{ academicLabel('ANUAL') }}</option><option value="PRIMER_CUATRIMESTRE">{{ academicLabel('PRIMER_CUATRIMESTRE') }}</option><option value="SEGUNDO_CUATRIMESTRE">{{ academicLabel('SEGUNDO_CUATRIMESTRE') }}</option></select></label><p v-if="fieldError" class="field-error sm:col-span-2" role="alert">{{ fieldError }}</p><div class="flex gap-3 sm:col-span-2"><button type="submit" class="min-h-11 rounded-lg bg-[var(--color-brand)] px-5 font-semibold text-white" :disabled="saving || !optionsReady || (isEdit && !selected)">{{ saving ? 'Guardando…' : 'Guardar cursada' }}</button><RouterLink :to="{ name: 'admin-courses' }" class="min-h-11 rounded-lg border border-[var(--color-border)] px-5 py-2.5">Cancelar</RouterLink></div></form></section></template>
  </main>
</template>

<style scoped>
.admin-input { margin-top: .25rem; min-height: 2.75rem; width: 100%; border: 1px solid var(--color-border); border-radius: .5rem; padding: 0 .75rem; font-weight: 400; }
.field-error { font-size: .875rem; color: #a31118; }
</style>
