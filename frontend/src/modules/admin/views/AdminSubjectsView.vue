<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AdminFilters from '../components/AdminFilters.vue'
import AdminPagination from '../components/AdminPagination.vue'
import AdminState from '../components/AdminState.vue'
import AdminTable from '../components/AdminTable.vue'
import { adminApi } from '../api/adminApi'
import { subjectSchema } from '../schemas/adminSchemas'
import type { Career, Prerequisite, Subject, SubjectWritePayload, SubjectYearGroup, TeachingAssignment } from '../types/admin'
import { useFeedback } from '@/ui/feedback'
import { academicLabel } from '@/core/presentation/academicLabels'

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
const teachers = ref<TeacherOption[]>([])
const newPrerequisiteId = ref(0)
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
  correlativasIds: [] as number[],
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
    const groups = await adminApi.getSubjectsByYear(careerId)
    if (requestVersion !== prerequisiteRequestVersion) return true
    prerequisiteGroups.value = normalizedGroups(groups)
    return true
  } catch {
    if (requestVersion !== prerequisiteRequestVersion) return true
    prerequisiteGroups.value = []
    prerequisiteError.value = 'No pudimos cargar las materias disponibles para correlatividades.'
    return false
  } finally {
    if (requestVersion === prerequisiteRequestVersion) prerequisiteLoading.value = false
  }
}

function clearPrerequisitesAfterCareerChange(): void {
  form.correlativasIds = []
  hasCorrelatividades.value = false
  prerequisiteGroups.value = []
  careerChangeNotice.value = 'Se limpiaron las correlatividades porque cambiaste de carrera.'
  removalWarning.value = ''
}

function toggleCorrelatividades(event: Event): void {
  const enabled = (event.target as HTMLInputElement).checked
  hasCorrelatividades.value = enabled
  removalWarning.value = !enabled && mode.value === 'admin-subject-edit'
    ? 'Al guardar, se eliminarán todas las correlatividades.'
    : ''
  if (enabled && form.carreraId) void loadPrerequisiteOptions(Number(form.carreraId))
}

function togglePrerequisite(subjectId: number): void {
  const ids = form.correlativasIds as number[]
  form.correlativasIds = ids.includes(subjectId) ? ids.filter((idValue) => idValue !== subjectId) : [...ids, subjectId]
}

function isPrerequisiteSelected(subjectId: number): boolean {
  return (form.correlativasIds as number[]).includes(subjectId)
}

async function loadList(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const result = await adminApi.listSubjects({
      search: search.value || undefined,
      carreraId: careerFilter.value ? Number(careerFilter.value) : undefined,
      page: Number(route.query.page ?? 1),
    })
    subjects.value = result.data
    pagination.value = result.pagination
  } catch {
    error.value = 'No pudimos cargar las materias.'
  } finally {
    loading.value = false
  }
}

async function loadDetail(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const subject = await adminApi.getSubject(id.value)
    selected.value = subject
    const careerId = subject.carreraId ?? subject.carrera?.id
    const [loadedPrerequisites, loadedAssignments, teacherResult] = await Promise.all([
      adminApi.getPrerequisites(subject.id),
      adminApi.getTeachingAssignments(subject.id),
      adminApi.listUsers({ rol: 'PROFESOR', limit: 100 }),
    ])
    prerequisites.value = loadedPrerequisites
    assignments.value = loadedAssignments
    teachers.value = teacherResult.data.map((user) => ({ idUsuario: user.idUsuario, apellidoNombre: user.apellidoNombre }))
    subjectOptions.value = careerId
      ? (await adminApi.listSubjects({ carreraId: careerId, limit: 100 })).data.filter((item) => item.id !== subject.id)
      : []
  } catch {
    error.value = 'No pudimos cargar la materia.'
  } finally {
    loading.value = false
  }
}

function apply(): void {
  void router.replace({ query: { search: search.value || undefined, carreraId: careerFilter.value || undefined, page: undefined } }).then(loadList)
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
    correlativasIds: [],
  })
  formReady.value = mode.value !== 'admin-subject-edit'
  hasCorrelatividades.value = false
  prerequisiteGroups.value = []
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
    const correlativasIds = currentPrerequisites.map((item) => item.materiaRequeridaId)
    Object.assign(form, subject, {
      carreraId: careerId,
      cursoAnio: subject.curso?.anio ?? 1,
      descripcion: subject.descripcion ?? '',
      horasCatedra: subject.horasCatedra ?? '',
      modalidad: subject.modalidad ?? 'PRESENCIAL',
      periodo: subject.periodo ?? 'ANUAL',
      regimen: subject.regimen ?? 'REGULAR_PRESENCIAL_SIN_PROMOCION',
      correlativasIds,
    })
    hasCorrelatividades.value = correlativasIds.length > 0
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
  const result = subjectSchema.safeParse({ ...form, correlativasIds: hasCorrelatividades.value ? form.correlativasIds : [] })
  if (!result.success) {
    fieldError.value = result.error.issues[0]?.message ?? 'Revisá los datos.'
    return
  }
  saving.value = true
  try {
    const payload: SubjectWritePayload = { ...result.data, cursoAnio: Number(result.data.cursoAnio), correlativasIds: result.data.correlativasIds ?? [] }
    if (mode.value === 'admin-subject-create') await adminApi.createSubject(payload)
    else await adminApi.updateSubject(id.value, payload)
    feedback.success(mode.value === 'admin-subject-create' ? 'Materia creada.' : 'Materia actualizada.')
    await router.replace({ name: 'admin-subjects' })
  } catch {
    feedback.error('No se pudo guardar la materia.')
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
  if (!selected.value || !newPrerequisiteId.value) return
  try {
    await adminApi.addPrerequisite(selected.value.id, { materiaRequeridaId: newPrerequisiteId.value })
    newPrerequisiteId.value = 0
    feedback.success('Correlatividad agregada.')
    await loadDetail()
  } catch {
    feedback.error('No se pudo agregar la correlatividad.')
  }
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

    <template v-if="isList">
      <AdminFilters v-model:search="search" placeholder="Nombre de materia" @submit="apply">
        <label class="text-sm font-semibold">Carrera<select v-model="careerFilter" class="mt-1 min-h-11 w-full rounded-lg border border-[var(--color-border)] px-3 font-normal"><option value="">Todas</option><option v-for="career in careers" :key="career.id" :value="career.id">{{ career.nombre }}</option></select></label>
      </AdminFilters>
      <div class="mt-5"><AdminState :loading="loading" :error="error" :empty="!loading && !error && !subjects.length" empty-text="No hay materias para mostrar." @retry="loadList"><AdminTable :columns="[{ key: 'name', label: 'Materia' }, { key: 'career', label: 'Carrera' }, { key: 'year', label: 'Año' }]">
        <template #rows><tr v-for="subject in subjects" :key="subject.id" class="border-t border-[var(--color-border)]"><td class="px-4 py-3"><RouterLink :to="{ name: 'admin-subject-detail', params: { id: subject.id } }" class="font-semibold text-[var(--color-brand)]">{{ subject.nombre }}</RouterLink></td><td class="px-4 py-3">{{ subject.carrera?.nombre ?? '—' }}</td><td class="px-4 py-3">{{ subject.curso?.anio ?? '—' }}°</td><td class="px-4 py-3 text-right"><RouterLink :to="{ name: 'admin-subject-edit', params: { id: subject.id } }" class="font-semibold text-[var(--color-brand)]">Editar</RouterLink></td></tr></template>
        <template #cards><article v-for="subject in subjects" :key="subject.id" class="rounded-lg border border-[var(--color-border)] p-4"><RouterLink :to="{ name: 'admin-subject-detail', params: { id: subject.id } }" class="font-semibold text-[var(--color-brand)]">{{ subject.nombre }}</RouterLink><p class="text-sm text-[var(--color-graphite)]">{{ subject.carrera?.nombre ?? '—' }} · {{ subject.curso?.anio ?? '—' }}° año</p></article></template>
      </AdminTable><AdminPagination :pagination="pagination" @change="(page) => router.replace({ query: { ...route.query, page: String(page) } }).then(loadList)" /></AdminState></div>
    </template>

    <template v-else-if="isDetail">
      <AdminState :loading="loading" :error="error" @retry="loadDetail"><section v-if="selected" class="mt-7 grid gap-5 lg:grid-cols-[1fr_20rem]"><div class="rounded-xl border border-[var(--color-border)] bg-white p-6"><div class="flex items-start justify-between gap-4"><div><h2 class="text-2xl font-semibold">{{ selected.nombre }}</h2><p class="text-[var(--color-graphite)]">{{ selected.carrera?.nombre ?? 'Carrera' }} · {{ selected.curso?.anio ?? '—' }}° año · {{ selected.cargaHoraria }} h</p></div><div class="flex gap-2"><RouterLink :to="{ name: 'admin-subject-edit', params: { id: selected.id } }" class="min-h-10 rounded-lg bg-[var(--color-brand)] px-4 py-2 font-semibold text-white">Editar</RouterLink><button type="button" class="min-h-10 rounded-lg border border-[var(--color-border)] px-4 py-2" @click="deactivate">Desactivar</button></div></div><p class="mt-5 whitespace-pre-wrap">{{ selected.descripcion || 'Sin descripción.' }}</p><h3 class="mt-7 text-xl font-semibold">Correlatividades obligatorias</h3><form class="mt-3 flex flex-wrap gap-2" @submit.prevent="addPrerequisite"><label class="sr-only" for="new-prerequisite">Materia requerida</label><select id="new-prerequisite" v-model.number="newPrerequisiteId" class="admin-input min-w-0 flex-1"><option :value="0">Agregar materia requerida</option><option v-for="subject in subjectOptions" :key="subject.id" :value="subject.id">{{ subject.nombre }}</option></select><button type="submit" class="min-h-11 rounded-lg bg-[var(--color-brand)] px-4 text-sm font-semibold text-white" :disabled="!newPrerequisiteId">Agregar</button></form><ul v-if="prerequisites.length" class="mt-3 space-y-2"><li v-for="item in prerequisites" :key="item.id" class="flex items-center justify-between rounded-lg bg-[#f6f7f4] p-3"><span>{{ item.materiaRequerida.nombre }}</span><button type="button" class="text-sm text-[var(--color-brand)]" @click="removePrerequisite(item)">Quitar</button></li></ul><p v-else class="mt-2 text-sm text-[var(--color-graphite)]">No hay correlativas.</p></div><aside class="rounded-xl border border-[var(--color-border)] bg-white p-6"><h3 class="font-semibold">Designaciones docentes</h3><form class="mt-3 flex flex-wrap gap-2" @submit.prevent="addTeacher"><label class="sr-only" for="new-teacher">Docente</label><select id="new-teacher" v-model.number="newTeacherId" class="admin-input min-w-0 flex-1"><option :value="0">Designar docente</option><option v-for="teacher in teachers" :key="teacher.idUsuario" :value="teacher.idUsuario">{{ teacher.apellidoNombre }}</option></select><button type="submit" class="min-h-11 rounded-lg bg-[var(--color-brand)] px-4 text-sm font-semibold text-white" :disabled="!newTeacherId">Agregar</button></form><ul v-if="assignments.length" class="mt-3 space-y-2"><li v-for="item in assignments" :key="item.id" class="flex items-center justify-between rounded-lg bg-[#f6f7f4] p-3 text-sm"><span>{{ item.profesor.apellidoNombre }}</span><button type="button" class="text-[var(--color-brand)]" @click="removeTeacher(item)">Quitar</button></li></ul><p v-else class="mt-2 text-sm text-[var(--color-graphite)]">No hay docentes designados.</p></aside></section></AdminState>
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
            <label class="flex min-h-11 items-center gap-3"><input v-model="hasCorrelatividades" type="checkbox" class="h-5 w-5" @change="toggleCorrelatividades" />Tiene correlatividades</label>
            <p v-if="careerChangeNotice" class="mt-2 text-sm text-[var(--color-graphite)]" role="status" aria-live="polite">{{ careerChangeNotice }}</p>
            <p v-if="removalWarning" class="mt-2 text-sm text-[#a31118]" role="alert">{{ removalWarning }}</p>
            <p v-if="hasCorrelatividades && !form.carreraId" class="mt-2 text-sm text-[var(--color-graphite)]">Seleccioná una carrera para ver las materias disponibles.</p>
            <p v-if="prerequisiteError" class="mt-2 text-sm text-[#a31118]" role="alert">{{ prerequisiteError }}</p>
            <div v-if="hasCorrelatividades && !prerequisiteLoading && !prerequisiteError" class="mt-3 space-y-3">
              <div v-for="group in prerequisiteGroups" :key="String(group.anio)" class="rounded-lg bg-[#f6f7f4] p-3">
                <h3 class="font-semibold">{{ group.anio === null ? 'Sin año' : `${group.anio}° año` }}</h3>
                <label v-for="subject in group.materias" :key="subject.id" class="mt-2 flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" class="h-5 w-5" :checked="isPrerequisiteSelected(subject.id)" @change="togglePrerequisite(subject.id)" /><span>{{ subject.nombre }}</span></label>
              </div>
              <p v-if="!prerequisiteGroups.length" class="text-sm text-[var(--color-graphite)]">No hay materias activas disponibles.</p>
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
