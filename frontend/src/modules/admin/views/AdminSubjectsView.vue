<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { isNavigationFailure, NavigationFailureType, RouterLink, useRoute, useRouter } from 'vue-router'
import AdminFilters from '../components/AdminFilters.vue'
import AdminPagination from '../components/AdminPagination.vue'
import AdminState from '../components/AdminState.vue'
import AdminTable from '../components/AdminTable.vue'
import { adminApi } from '../api/adminApi'
import { subjectSchema } from '../schemas/adminSchemas'
import type { Career, Prerequisite, Subject, SubjectWritePayload, SubjectYearGroup, TeachingAssignment } from '../types/admin'
import { useFeedback } from '@/ui/feedback'
import { apiErrorMessage } from '@/core/api/errors'
import { academicLabel } from '@/core/presentation/academicLabels'
import SpacesAdminPanel from '@/modules/spaces/components/SpacesAdminPanel.vue'
import { spacesApi, type CurriculumSpace } from '@/modules/spaces/api/spacesApi'
import type { CorrelativityWrite } from '../types/admin'

type TeacherOption = { idUsuario: number; apellidoNombre: string }

const route = useRoute()
const router = useRouter()
const feedback = useFeedback()
const subjects = ref<Subject[]>([])
const careers = ref<Career[]>([])
const selected = ref<Subject | null>(null)
const prerequisites = ref<Prerequisite[]>([])
const assignments = ref<TeachingAssignment[]>([])
const subjectOptions = ref<Subject[]>([])
const prerequisiteGroups = ref<SubjectYearGroup[]>([])
const prerequisiteSpaces = ref<CurriculumSpace[]>([])
const correlatividades = ref<CorrelativityWrite[]>([])
const prerequisiteNames = ref<Record<string, string>>({})
const prerequisiteChoice = ref('')
const teachers = ref<TeacherOption[]>([])
const detailPrerequisiteChoice = ref('')
const newTeacherId = ref(0)
const loading = ref(false)
const error = ref('')
const saving = ref(false)
const careersLoading = ref(false)
const careersReady = ref(false)
const formReady = ref(true)
const prerequisiteLoading = ref(false)
const prerequisiteError = ref('')
const careerOptionsError = ref('')
const careerChangeNotice = ref('')
const removalWarning = ref('')
const hasCorrelatividades = ref(false)
const hydratingEdit = ref(false)
let prerequisiteRequestVersion = 0
let listRequest = 0
let disposed = false
const search = ref(String(route.query.search ?? ''))
const careerFilter = ref(String(route.query.carreraId ?? ''))
const pagination = ref({ page: 1, limit: 20, total: 0, totalPages: 0 })
const form = reactive<Record<string, any>>({
  nombre: '',
  carreraId: Number(route.query.carreraId ?? 0),
  cursoAnio: 1,
  cargaHoraria: 1,
  tipoEspacio: 'MATERIA',
  descripcion: '',
  horasCatedra: '',
  modalidad: 'PRESENCIAL',
  periodo: 'ANUAL',
  regimen: 'REGULAR_PRESENCIAL_SIN_PROMOCION',
})
const fieldError = ref('')

const mode = computed(() => String(route.name))
const isList = computed(() => mode.value === 'admin-subjects')
const isDetail = computed(() => mode.value === 'admin-subject-detail')
const id = computed(() => Number(route.params.id))
const isForm = computed(() => !isList.value && !isDetail.value)
const canSave = computed(() => isForm.value
  && careersReady.value
  && formReady.value
  && !saving.value
  && (!hasCorrelatividades.value || (!prerequisiteLoading.value && !prerequisiteError.value)))
const isSpaceComponent = computed(() => Boolean(form.espacioCurricularId))

async function loadCareers(): Promise<void> {
  careersLoading.value = true
  careersReady.value = false
  careerOptionsError.value = ''
  try {
    careers.value = (await adminApi.listCareers({ limit: 100 })).data
    careersReady.value = true
  } catch {
    careers.value = []
    careerOptionsError.value = 'No pudimos cargar las carreras.'
  } finally {
    careersLoading.value = false
  }
}

function normalizedGroups(groups: SubjectYearGroup[]): SubjectYearGroup[] {
  return groups
    .map((group) => ({
      ...group,
      materias: group.materias.filter((subject) => subject.activo && subject.id !== id.value),
      cantidad: group.materias.filter((subject) => subject.activo && subject.id !== id.value).length,
    }))
    .filter((group) => group.materias.length > 0)
}

async function loadPrerequisiteOptions(careerId: number): Promise<boolean> {
  const requestVersion = ++prerequisiteRequestVersion
  prerequisiteLoading.value = true
  prerequisiteError.value = ''
  try {
    const [groups, spaces] = await Promise.all([adminApi.getSubjectsByYear(careerId), spacesApi.list()])
    if (requestVersion !== prerequisiteRequestVersion) return true
    prerequisiteGroups.value = normalizedGroups(groups)
    prerequisiteSpaces.value = spaces.filter((space) => space.activo && space.carreraId === careerId)
    return true
  } catch {
    if (requestVersion !== prerequisiteRequestVersion) return true
    prerequisiteGroups.value = []
    prerequisiteSpaces.value = []
    prerequisiteError.value = 'No pudimos cargar las materias disponibles para correlatividades.'
    return false
  } finally {
    if (requestVersion === prerequisiteRequestVersion) prerequisiteLoading.value = false
  }
}

function clearPrerequisitesAfterCareerChange(): void {
  correlatividades.value = []
  prerequisiteNames.value = {}
  prerequisiteChoice.value = ''
  hasCorrelatividades.value = false
  prerequisiteGroups.value = []
  prerequisiteSpaces.value = []
  careerChangeNotice.value = 'Se limpiaron las correlatividades porque cambiaste de carrera.'
  removalWarning.value = ''
}

function toggleCorrelatividades(event: Event): void {
  const enabled = (event.target as HTMLInputElement).checked
  if (isSpaceComponent.value) return
  hasCorrelatividades.value = enabled
  removalWarning.value = !enabled && mode.value === 'admin-subject-edit'
    ? 'Al guardar, se eliminarán todas las correlatividades.'
    : ''
  if (!enabled) correlatividades.value = []
  if (enabled && form.carreraId) void loadPrerequisiteOptions(Number(form.carreraId))
}

function addCorrelativity(): void {
  const [kind, rawId] = prerequisiteChoice.value.split(':')
  const id = Number(rawId)
  if ((kind !== 'MATERIA' && kind !== 'ESPACIO') || !Number.isInteger(id) || id < 1) return
  const exists = correlatividades.value.some((rule) => kind === 'MATERIA'
    ? rule.materiaRequeridaId === id
    : rule.espacioRequeridoId === id)
  if (exists) { fieldError.value = 'Esa correlativa ya está agregada.'; return }
  correlatividades.value.push({
    ...(kind === 'MATERIA' ? { materiaRequeridaId: id } : { espacioRequeridoId: id }),
    aplicaCursado: false,
    aplicaRendir: true,
  })
  prerequisiteChoice.value = ''
  fieldError.value = ''
}

function removeCorrelativity(index: number): void {
  correlatividades.value.splice(index, 1)
}

function correlativityLabel(rule: CorrelativityWrite): string {
  if (rule.materiaRequeridaId !== undefined) {
    const subject = prerequisiteGroups.value.flatMap((group) => group.materias).find((item) => item.id === rule.materiaRequeridaId)
    return `Materia: ${subject?.nombre ?? prerequisiteNames.value[`MATERIA:${rule.materiaRequeridaId}`] ?? 'Correlativa no disponible'}`
  }
  const space = prerequisiteSpaces.value.find((item) => item.id === rule.espacioRequeridoId)
  return `Espacio curricular: ${space?.nombre ?? prerequisiteNames.value[`ESPACIO:${rule.espacioRequeridoId}`] ?? 'Correlativa no disponible'}`
}

async function loadList(): Promise<void> {
  const request = ++listRequest
  loading.value = true
  error.value = ''
  try {
    const result = await adminApi.listSubjects({
      search: search.value || undefined,
      carreraId: careerFilter.value ? Number(careerFilter.value) : undefined,
      page: Number(route.query.page ?? 1),
    })
    if (disposed || request !== listRequest || !isList.value) return
    subjects.value = result.data
    pagination.value = result.pagination
  } catch {
    if (!disposed && request === listRequest && isList.value) error.value = 'No pudimos cargar las materias.'
  } finally {
    if (!disposed && request === listRequest && isList.value) loading.value = false
  }
}

function invalidateList(): void {
  listRequest += 1
  loading.value = true
  error.value = ''
}

async function loadDetail(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const subject = await adminApi.getSubject(id.value)
    selected.value = subject
    const careerId = subject.carreraId ?? subject.carrera?.id
    const [loadedPrerequisites, loadedAssignments, teacherResult, spaces, groups] = await Promise.all([
      adminApi.getPrerequisites(subject.id),
      adminApi.getTeachingAssignments(subject.id),
      adminApi.listUsers({ rol: 'PROFESOR', limit: 100 }),
      spacesApi.list(),
      careerId ? adminApi.getSubjectsByYear(careerId) : Promise.resolve([]),
    ])
    prerequisites.value = loadedPrerequisites
    assignments.value = loadedAssignments
    teachers.value = teacherResult.data.map((user) => ({ idUsuario: user.idUsuario, apellidoNombre: user.apellidoNombre }))
    subjectOptions.value = groups.flatMap((group) => group.materias).filter((item) => item.id !== subject.id && item.activo)
    prerequisiteSpaces.value = spaces.filter((space) => space.carreraId === careerId && space.activo)
  } catch {
    error.value = 'No pudimos cargar la materia.'
  } finally {
    loading.value = false
  }
}

function apply(): void {
  replaceListQuery({ search: search.value || undefined, carreraId: careerFilter.value || undefined, page: undefined })
}

function replaceListQuery(query: Record<string, string | undefined>): void {
  void router.replace({ query }).then((failure) => {
    if (failure && isNavigationFailure(failure, NavigationFailureType.duplicated)) void loadList()
  })
}

function reset(): void {
  Object.assign(form, {
    nombre: '',
    carreraId: Number(route.query.carreraId ?? 0),
    cursoAnio: 1,
    cargaHoraria: 1,
    tipoEspacio: 'MATERIA',
    descripcion: '',
    horasCatedra: '',
    modalidad: 'PRESENCIAL',
    periodo: 'ANUAL',
    regimen: 'REGULAR_PRESENCIAL_SIN_PROMOCION',
  })
  formReady.value = mode.value !== 'admin-subject-edit'
  hasCorrelatividades.value = false
  correlatividades.value = []
  prerequisiteNames.value = {}
  prerequisiteChoice.value = ''
  prerequisiteGroups.value = []
  prerequisiteSpaces.value = []
  prerequisiteError.value = ''
  careerChangeNotice.value = ''
  removalWarning.value = ''
  fieldError.value = ''
  if (mode.value === 'admin-subject-edit') {
    void loadEditForm()
  }
}

async function loadEditForm(): Promise<void> {
  hydratingEdit.value = true
  formReady.value = false
  let loaded = false
  try {
    const [subject, currentPrerequisites] = await Promise.all([
      adminApi.getSubject(id.value),
      adminApi.getPrerequisites(id.value),
    ])
    const careerId = subject.carreraId ?? subject.carrera?.id ?? 0
    const correlativas = currentPrerequisites.flatMap<CorrelativityWrite>((item) => {
      if (item.materiaRequeridaId) return [{ materiaRequeridaId: item.materiaRequeridaId, aplicaCursado: item.aplicaCursado ?? false, aplicaRendir: item.aplicaRendir ?? true }]
      if (item.espacioRequeridoId) return [{ espacioRequeridoId: item.espacioRequeridoId, aplicaCursado: item.aplicaCursado ?? false, aplicaRendir: item.aplicaRendir ?? true }]
      return []
    })
    prerequisiteNames.value = Object.fromEntries(currentPrerequisites.flatMap((item) => {
      if (item.materiaRequeridaId && item.materiaRequerida) return [[`MATERIA:${item.materiaRequeridaId}`, item.materiaRequerida.nombre]]
      if (item.espacioRequeridoId && item.espacioRequerido) return [[`ESPACIO:${item.espacioRequeridoId}`, item.espacioRequerido.nombre]]
      return []
    }))
    Object.assign(form, subject, {
      carreraId: careerId,
      cursoAnio: subject.curso?.anio ?? 1,
      descripcion: subject.descripcion ?? '',
      horasCatedra: subject.horasCatedra ?? '',
      modalidad: subject.modalidad ?? 'PRESENCIAL',
      periodo: subject.periodo ?? 'ANUAL',
      regimen: subject.regimen ?? 'REGULAR_PRESENCIAL_SIN_PROMOCION',
    })
    correlatividades.value = correlativas
    hasCorrelatividades.value = correlativas.length > 0
    loaded = careerId ? await loadPrerequisiteOptions(careerId) : true
  } catch {
    error.value = 'No pudimos cargar la materia y sus correlatividades.'
    prerequisiteGroups.value = []
  } finally {
    hydratingEdit.value = false
    formReady.value = loaded
  }
}

async function save(): Promise<void> {
  if (!canSave.value) return
  fieldError.value = ''
  if (hasCorrelatividades.value && !isSpaceComponent.value && !correlatividades.value.length) {
    fieldError.value = 'Agregá al menos una correlativa antes de guardar.'
    return
  }
  const result = subjectSchema.safeParse(form)
  if (!result.success) {
    fieldError.value = result.error.issues[0]?.message ?? 'Revisá los datos.'
    return
  }
  saving.value = true
  try {
    const payload: SubjectWritePayload = {
      ...result.data,
      cursoAnio: Number(result.data.cursoAnio),
      ...(isSpaceComponent.value ? {} : { correlatividades: hasCorrelatividades.value ? correlatividades.value : [] }),
    }
    if (mode.value === 'admin-subject-create') await adminApi.createSubject(payload)
    else await adminApi.updateSubject(id.value, payload)
    feedback.success(mode.value === 'admin-subject-create' ? 'Materia creada.' : 'Materia actualizada.')
    await router.replace({ name: 'admin-subjects' })
  } catch (cause) {
    feedback.error(apiErrorMessage(cause, 'No se pudo guardar la materia.'))
  } finally {
    saving.value = false
  }
}

async function deactivate(): Promise<void> {
  if (!selected.value || !window.confirm('¿Desactivar esta materia?')) return
  try {
    await adminApi.deactivateSubject(selected.value.id)
    feedback.success('Materia desactivada.')
    await router.replace({ name: 'admin-subjects' })
  } catch {
    feedback.error('No se pudo desactivar la materia.')
  }
}

async function addPrerequisite(): Promise<void> {
  if (!selected.value) return
  const [kind, rawId] = detailPrerequisiteChoice.value.split(':')
  const targetId = Number(rawId)
  if ((kind !== 'MATERIA' && kind !== 'ESPACIO') || !Number.isInteger(targetId) || targetId < 1) return
  const duplicate = prerequisites.value.some((item) => kind === 'MATERIA'
    ? item.materiaRequeridaId === targetId
    : item.espacioRequeridoId === targetId)
  if (duplicate) { feedback.error('Esa correlativa ya está agregada.'); return }
  try {
    await adminApi.addPrerequisite(selected.value.id, {
      ...(kind === 'MATERIA' ? { materiaRequeridaId: targetId } : { espacioRequeridoId: targetId }),
      aplicaCursado: false,
      aplicaRendir: true,
    })
    detailPrerequisiteChoice.value = ''
    feedback.success('Correlatividad agregada.')
    await loadDetail()
  } catch {
    feedback.error('No se pudo agregar la correlatividad.')
  }
}

function detailPrerequisiteLabel(item: Prerequisite): string {
  return item.materiaRequerida
    ? `Materia: ${item.materiaRequerida.nombre}`
    : `Espacio curricular: ${item.espacioRequerido?.nombre ?? 'Correlativa'}`
}

async function removePrerequisite(item: Prerequisite): Promise<void> {
  if (!window.confirm('¿Quitar esta correlatividad?')) return
  try {
    await adminApi.removePrerequisite(item.id)
    feedback.success('Correlatividad quitada.')
    await loadDetail()
  } catch {
    feedback.error('No se pudo quitar la correlatividad.')
  }
}

async function addTeacher(): Promise<void> {
  if (!selected.value || !newTeacherId.value) return
  try {
    await adminApi.assignTeacher(selected.value.id, newTeacherId.value)
    newTeacherId.value = 0
    feedback.success('Docente designado.')
    await loadDetail()
  } catch {
    feedback.error('No se pudo designar al docente.')
  }
}

async function removeTeacher(item: TeachingAssignment): Promise<void> {
  if (!selected.value || !window.confirm('¿Quitar esta designación?')) return
  try {
    await adminApi.removeTeacher(selected.value.id, item.profesorId)
    feedback.success('Designación quitada.')
    await loadDetail()
  } catch {
    feedback.error('No se pudo quitar la designación.')
  }
}

onMounted(() => {
  void loadCareers()
  if (isList.value) void loadList()
  else if (isDetail.value) void loadDetail()
  else reset()
})
onBeforeUnmount(() => { disposed = true; listRequest += 1 })

watch(() => form.carreraId, (careerId, previousCareerId) => {
  if (hydratingEdit.value) return
  if (previousCareerId && careerId !== previousCareerId) clearPrerequisitesAfterCareerChange()
  if (careerId) void loadPrerequisiteOptions(Number(careerId))
})

watch(() => route.fullPath, () => {
  if (isList.value) void loadList()
  else if (isDetail.value) void loadDetail()
  else reset()
})
</script>

<template>
  <main aria-labelledby="admin-subjects-title" class="mx-auto max-w-6xl">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div><p class="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--color-brand)]">Administración</p><h1 id="admin-subjects-title" class="mt-2 text-3xl font-semibold">Materias</h1></div>
      <RouterLink v-if="isList" :to="{ name: 'admin-subject-create' }" class="min-h-11 rounded-lg bg-[var(--color-brand)] px-4 py-2.5 font-semibold text-white">Nueva materia</RouterLink>
    </div>

    <nav aria-label="Administración académica" class="mt-5 flex flex-wrap gap-2 border-b border-[var(--color-border)] pb-3">
      <RouterLink :to="{ name: 'admin-subjects', query: { ...route.query, tab: undefined } }" class="min-h-10 rounded-lg px-4 py-2 font-semibold" :class="route.query.tab === 'spaces' ? 'text-[var(--color-graphite)]' : 'bg-[var(--color-brand)] text-white'">Materias</RouterLink>
      <RouterLink :to="{ name: 'admin-subjects', query: { ...route.query, tab: 'spaces' } }" class="min-h-10 rounded-lg px-4 py-2 font-semibold" :class="route.query.tab === 'spaces' ? 'bg-[var(--color-brand)] text-white' : 'text-[var(--color-graphite)]'">Espacios curriculares</RouterLink>
    </nav>

    <SpacesAdminPanel v-if="route.query.tab === 'spaces'" class="mt-6" />

    <template v-if="route.query.tab === 'spaces'"></template>
    <template v-else-if="isList">
      <AdminFilters v-model:search="search" placeholder="Nombre de materia" @searching="invalidateList" @submit="apply">
        <label class="text-sm font-semibold">Carrera<select v-model="careerFilter" class="mt-1 min-h-11 w-full rounded-lg border border-[var(--color-border)] px-3 font-normal"><option value="">Todas</option><option v-for="career in careers" :key="career.id" :value="career.id">{{ career.nombre }}</option></select></label>
      </AdminFilters>
      <div class="mt-5"><AdminState :loading="loading" :error="error" :empty="!loading && !error && !subjects.length" empty-text="No hay materias para mostrar." @retry="loadList"><AdminTable :columns="[{ key: 'name', label: 'Materia' }, { key: 'career', label: 'Carrera' }, { key: 'year', label: 'Año' }]">
        <template #rows><tr v-for="subject in subjects" :key="subject.id" class="border-t border-[var(--color-border)]"><td class="px-4 py-3"><RouterLink :to="{ name: 'admin-subject-detail', params: { id: subject.id } }" class="font-semibold text-[var(--color-brand)]">{{ subject.nombre }}</RouterLink></td><td class="px-4 py-3">{{ subject.carrera?.nombre ?? '—' }}</td><td class="px-4 py-3">{{ subject.curso?.anio ?? '—' }}°</td><td class="px-4 py-3 text-right"><RouterLink :to="{ name: 'admin-subject-edit', params: { id: subject.id } }" class="font-semibold text-[var(--color-brand)]">Editar</RouterLink></td></tr></template>
        <template #cards><article v-for="subject in subjects" :key="subject.id" class="rounded-lg border border-[var(--color-border)] p-4"><RouterLink :to="{ name: 'admin-subject-detail', params: { id: subject.id } }" class="font-semibold text-[var(--color-brand)]">{{ subject.nombre }}</RouterLink><p class="text-sm text-[var(--color-graphite)]">{{ subject.carrera?.nombre ?? '—' }} · {{ subject.curso?.anio ?? '—' }}° año</p></article></template>
      </AdminTable><AdminPagination :pagination="pagination" @change="(page) => router.replace({ query: { ...route.query, page: String(page) } })" /></AdminState></div>
    </template>

    <template v-else-if="isDetail">
      <AdminState :loading="loading" :error="error" @retry="loadDetail"><section v-if="selected" class="mt-7 grid gap-5 lg:grid-cols-[1fr_20rem]"><div class="rounded-xl border border-[var(--color-border)] bg-white p-6"><div class="flex items-start justify-between gap-4"><div><h2 class="text-2xl font-semibold">{{ selected.nombre }}</h2><p class="text-[var(--color-graphite)]">{{ selected.carrera?.nombre ?? 'Carrera' }} · {{ selected.curso?.anio ?? '—' }}° año · {{ selected.cargaHoraria }} h</p></div><div class="flex gap-2"><RouterLink :to="{ name: 'admin-subject-edit', params: { id: selected.id } }" class="min-h-10 rounded-lg bg-[var(--color-brand)] px-4 py-2 font-semibold text-white">Editar</RouterLink><button type="button" class="min-h-10 rounded-lg border border-[var(--color-border)] px-4 py-2" @click="deactivate">Desactivar</button></div></div><p class="mt-5 whitespace-pre-wrap">{{ selected.descripcion || 'Sin descripción.' }}</p><h3 class="mt-7 text-xl font-semibold">Correlativas</h3><form class="mt-3 flex flex-col gap-2 sm:flex-row" @submit.prevent="addPrerequisite"><label class="sr-only" for="new-prerequisite">Correlativa</label><select id="new-prerequisite" v-model="detailPrerequisiteChoice" class="admin-input min-w-0 flex-1"><option value="">Seleccioná una correlativa</option><optgroup label="Materias"><option v-for="subject in subjectOptions" :key="subject.id" :value="`MATERIA:${subject.id}`">{{ subject.nombre }}</option></optgroup><optgroup label="Espacios curriculares"><option v-for="space in prerequisiteSpaces" :key="space.id" :value="`ESPACIO:${space.id}`">{{ space.nombre }}</option></optgroup></select><button type="submit" class="min-h-11 rounded-lg bg-[var(--color-brand)] px-4 text-sm font-semibold text-white" :disabled="!detailPrerequisiteChoice">Agregar</button></form><p class="mt-1 text-sm text-[var(--color-graphite)]">La correlativa nueva aplica para rendir, como en el formulario de Materias.</p><ul v-if="prerequisites.length" class="mt-3 space-y-2"><li v-for="item in prerequisites" :key="item.id" class="flex items-center justify-between rounded-lg bg-[#f6f7f4] p-3"><span>{{ detailPrerequisiteLabel(item) }}</span><button type="button" class="min-h-9 text-sm text-[var(--color-brand)] underline" :aria-label="`Quitar ${detailPrerequisiteLabel(item)}`" @click="removePrerequisite(item)">Quitar</button></li></ul><p v-else class="mt-2 text-sm text-[var(--color-graphite)]">No hay correlativas.</p></div><aside class="rounded-xl border border-[var(--color-border)] bg-white p-6"><h3 class="font-semibold">Designaciones docentes</h3><form class="mt-3 flex flex-wrap gap-2" @submit.prevent="addTeacher"><label class="sr-only" for="new-teacher">Docente</label><select id="new-teacher" v-model.number="newTeacherId" class="admin-input min-w-0 flex-1"><option :value="0">Designar docente</option><option v-for="teacher in teachers" :key="teacher.idUsuario" :value="teacher.idUsuario">{{ teacher.apellidoNombre }}</option></select><button type="submit" class="min-h-11 rounded-lg bg-[var(--color-brand)] px-4 text-sm font-semibold text-white" :disabled="!newTeacherId">Agregar</button></form><ul v-if="assignments.length" class="mt-3 space-y-2"><li v-for="item in assignments" :key="item.id" class="flex items-center justify-between rounded-lg bg-[#f6f7f4] p-3 text-sm"><span>{{ item.profesor.apellidoNombre }}</span><button type="button" class="text-[var(--color-brand)]" @click="removeTeacher(item)">Quitar</button></li></ul><p v-else class="mt-2 text-sm text-[var(--color-graphite)]">No hay docentes designados.</p></aside></section></AdminState>
    </template>

    <template v-else>
        <section class="mt-7 max-w-3xl rounded-xl border border-[var(--color-border)] bg-white p-6" :aria-busy="careersLoading || hydratingEdit || prerequisiteLoading">
        <h2 class="text-2xl font-semibold">{{ mode === 'admin-subject-create' ? 'Nueva materia' : 'Editar materia' }}</h2>
        <p v-if="!careersReady || hydratingEdit || prerequisiteLoading" class="mt-3 text-sm text-[var(--color-graphite)]" role="status">Cargando opciones…</p>
        <form class="mt-5 grid gap-4 sm:grid-cols-2" @submit.prevent="save">
          <label class="font-semibold sm:col-span-2">Nombre<input v-model="form.nombre" class="admin-input" /></label>
          <label class="font-semibold">Carrera<select v-model.number="form.carreraId" class="admin-input"><option :value="0">Seleccionar</option><option v-for="career in careers" :key="career.id" :value="career.id">{{ career.nombre }}</option></select></label>
          <div v-if="careerOptionsError" class="sm:col-span-2"><p class="field-error" role="alert">{{ careerOptionsError }}</p><button type="button" class="mt-2 min-h-11 rounded-lg border border-[var(--color-brand)] px-4 font-semibold text-[var(--color-brand)]" @click="loadCareers">Reintentar carreras</button></div>
          <label class="font-semibold">Año del plan<input v-model.number="form.cursoAnio" type="number" min="1" class="admin-input" /></label>
          <label class="font-semibold">Carga horaria<input v-model.number="form.cargaHoraria" type="number" min="1" class="admin-input" /></label>
          <label class="font-semibold">Tipo de espacio<select v-model="form.tipoEspacio" class="admin-input"><option value="MATERIA">{{ academicLabel('MATERIA') }}</option><option value="SEMINARIO">{{ academicLabel('SEMINARIO') }}</option><option value="TALLER">{{ academicLabel('TALLER') }}</option><option value="TALLER_PRACTICA">{{ academicLabel('TALLER_PRACTICA') }}</option></select></label>
          <label class="font-semibold">Modalidad<select v-model="form.modalidad" class="admin-input"><option value="PRESENCIAL">{{ academicLabel('PRESENCIAL') }}</option><option value="SEMIPRESENCIAL">{{ academicLabel('SEMIPRESENCIAL') }}</option><option value="LIBRE">{{ academicLabel('LIBRE') }}</option></select></label>
          <label class="font-semibold">Período<select v-model="form.periodo" class="admin-input"><option value="ANUAL">{{ academicLabel('ANUAL') }}</option><option value="PRIMER_CUATRIMESTRE">{{ academicLabel('PRIMER_CUATRIMESTRE') }}</option><option value="SEGUNDO_CUATRIMESTRE">{{ academicLabel('SEGUNDO_CUATRIMESTRE') }}</option></select></label>
          <fieldset class="sm:col-span-2 rounded-lg border border-[var(--color-border)] p-4">
            <legend class="px-1 font-semibold">Correlatividades</legend>
            <p v-if="isSpaceComponent" class="text-sm text-[var(--color-graphite)]">Esta materia hereda las correlativas del espacio curricular al que pertenece.</p>
            <label v-else class="flex min-h-11 items-center gap-3"><input v-model="hasCorrelatividades" type="checkbox" class="h-5 w-5" @change="toggleCorrelatividades" />Tiene correlativas</label>
            <p v-if="careerChangeNotice" class="mt-2 text-sm text-[var(--color-graphite)]" role="status" aria-live="polite">{{ careerChangeNotice }}</p>
            <p v-if="removalWarning" class="mt-2 text-sm text-[#a31118]" role="alert">{{ removalWarning }}</p>
            <p v-if="hasCorrelatividades && !form.carreraId" class="mt-2 text-sm text-[var(--color-graphite)]">Seleccioná una carrera para ver las correlativas disponibles.</p>
            <p v-if="prerequisiteError" class="mt-2 text-sm text-[#a31118]" role="alert">{{ prerequisiteError }} <button type="button" class="underline" @click="form.carreraId && loadPrerequisiteOptions(Number(form.carreraId))">Reintentar</button></p>
            <div v-if="hasCorrelatividades && !isSpaceComponent && !prerequisiteLoading && !prerequisiteError" class="mt-3 space-y-3">
              <p class="text-sm text-[var(--color-graphite)]">Elegí una materia o un espacio curricular de la misma carrera.</p>
              <div class="flex flex-col gap-2 sm:flex-row">
                <label for="prerequisite-choice" class="sr-only">Correlativa</label>
                <select id="prerequisite-choice" v-model="prerequisiteChoice" class="admin-input min-w-0 flex-1" :disabled="!form.carreraId">
                  <option value="">Seleccioná una correlativa</option>
                  <optgroup label="Materias"><option v-for="subject in prerequisiteGroups.flatMap((group) => group.materias)" :key="subject.id" :value="`MATERIA:${subject.id}`">{{ subject.nombre }}</option></optgroup>
                  <optgroup label="Espacios curriculares"><option v-for="space in prerequisiteSpaces" :key="space.id" :value="`ESPACIO:${space.id}`">{{ space.nombre }}</option></optgroup>
                </select>
                <button type="button" class="min-h-11 rounded-lg border border-[var(--color-brand)] px-4 font-semibold text-[var(--color-brand)] disabled:opacity-50" :disabled="!prerequisiteChoice" @click="addCorrelativity">Agregar</button>
              </div>
              <ul v-if="correlatividades.length" class="space-y-2">
                <li v-for="(rule, index) in correlatividades" :key="`${rule.materiaRequeridaId ?? `e${rule.espacioRequeridoId}`}`" class="flex items-center justify-between gap-3 rounded-lg bg-[#f6f7f4] p-3 text-sm">
                  <span>{{ correlativityLabel(rule) }}</span>
                  <button type="button" class="min-h-9 rounded px-2 font-semibold text-[var(--color-brand)] underline" :aria-label="`Quitar ${correlativityLabel(rule)}`" @click="removeCorrelativity(index)">Quitar</button>
                </li>
              </ul>
              <p v-else class="text-sm text-[var(--color-graphite)]">Todavía no agregaste correlativas.</p>
            </div>
          </fieldset>
          <label class="font-semibold sm:col-span-2">Descripción<textarea v-model="form.descripcion" class="admin-input min-h-24"></textarea></label>
          <p v-if="fieldError" class="field-error sm:col-span-2" role="alert">{{ fieldError }}</p>
          <div class="flex gap-3 sm:col-span-2"><button type="submit" class="min-h-11 rounded-lg bg-[var(--color-brand)] px-5 font-semibold text-white" :disabled="!canSave">{{ saving ? 'Guardando…' : 'Guardar materia' }}</button><RouterLink :to="{ name: 'admin-subjects' }" class="min-h-11 rounded-lg border border-[var(--color-border)] px-5 py-2.5">Cancelar</RouterLink></div>
        </form>
      </section>
    </template>
  </main>
</template>

<style scoped>
.admin-input { margin-top: .25rem; min-height: 2.75rem; width: 100%; border: 1px solid var(--color-border); border-radius: .5rem; padding: 0 .75rem; font-weight: 400; }
.field-error { font-size: .875rem; color: #a31118; }
</style>
