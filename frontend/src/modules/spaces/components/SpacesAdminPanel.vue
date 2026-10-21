<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { apiClient } from '@/core/api/client'
import { spacesApi, type CareerOption, type CurriculumSpace, type SpacePrerequisite, type SpacePrerequisiteInput, type SubjectOption } from '../api/spacesApi'

const spaces = ref<CurriculumSpace[]>([])
const careers = ref<CareerOption[]>([])
const subjects = ref<SubjectOption[]>([])
const requirements = ref<SpacePrerequisite[]>([])
const selectedId = ref<number | null>(null)
const editingId = ref<number | null>(null)
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const notice = ref('')
const requirementChoice = ref('')
const originalComponentIds = ref<number[]>([])
const createHasPrerequisites = ref(false)
const createPrerequisites = ref<Array<{ kind: 'materia' | 'espacio'; targetId: number; aplicaCursado: boolean; aplicaRendir: boolean }>>([])
const componentRules = ref<Array<{ subjectName: string; prerequisiteName: string }>>([])
const componentRulesLoadError = ref(false)
const reviewConfirmed = ref(false)
let componentRulesRequest = 0
let subjectsRequest = 0
const form = reactive({ nombre: '', carreraId: 0, descripcion: '', componentesIds: [] as number[] })
const requirement = reactive({ aplicaCursado: false, aplicaRendir: true })
const selected = computed(() => spaces.value.find((item) => item.id === selectedId.value) ?? null)
const latched = computed(() => Boolean(selected.value?.composicionBloqueadaAt))
const eligibleSubjects = computed(() => {
  const currentComponentIds = new Set(editingId.value === null
    ? form.componentesIds
    : spaces.value.find((space) => space.id === editingId.value)?.materias.map((component) => component.id) ?? [])

  return subjects.value.filter((subject) => subject.carreraId === form.carreraId && subject.activo
    && (currentComponentIds.has(subject.id)
      || !spaces.value.some((space) => space.id !== editingId.value
        && space.materias.some((component) => component.id === subject.id))))
})
const requiredSubjects = computed(() => {
  const careerId = selected.value?.carreraId ?? form.carreraId
  const ownComponentIds = new Set(editingId.value !== null || !selected.value
    ? form.componentesIds
    : selected.value.materias.map((component) => component.id))
  return subjects.value.filter((subject) => subject.carreraId === careerId && subject.activo && !ownComponentIds.has(subject.id))
})
const eligibleSpaces = computed(() => {
  return spaces.value.filter((space) => space.carreraId === (selected.value?.carreraId ?? form.carreraId)
    && space.activo
    && space.id !== (selectedId.value ?? editingId.value))
})

async function load(): Promise<void> {
  loading.value = true; error.value = ''
  try {
    const [loadedSpaces, careerResult] = await Promise.all([
      spacesApi.list(), apiClient.getPaginated<CareerOption>('/carreras?limit=100'),
    ])
    spaces.value = loadedSpaces
    careers.value = careerResult.data
    if (selectedId.value && !spaces.value.some((space) => space.id === selectedId.value)) selectedId.value = null
  } catch { error.value = 'No pudimos cargar los espacios curriculares y las carreras.' }
  finally { loading.value = false }
}

async function loadSubjects(carreraId: number): Promise<void> {
  const request = ++subjectsRequest
  subjects.value = []
  if (!carreraId) return
  try {
    const firstPage = await apiClient.getPaginated<SubjectOption>(`/materias?carreraId=${carreraId}&activo=true&page=1&limit=100`)
    const pages = await Promise.all(Array.from({ length: Math.max(0, (firstPage.pagination?.totalPages ?? 1) - 1) }, (_, index) =>
      apiClient.getPaginated<SubjectOption>(`/materias?carreraId=${carreraId}&activo=true&page=${index + 2}&limit=100`)))
    if (request !== subjectsRequest || Number(form.carreraId) !== carreraId) return
    subjects.value = [...firstPage.data, ...pages.flatMap((page) => page.data)]
  } catch { if (request === subjectsRequest) error.value = 'No pudimos cargar las materias de la carrera.' }
}

function startCreate(): void {
  selectedId.value = null; editingId.value = null
  originalComponentIds.value = []
  Object.assign(form, { nombre: '', carreraId: 0, descripcion: '', componentesIds: [] })
  createHasPrerequisites.value = false; createPrerequisites.value = []; componentRules.value = []; requirements.value = []
  requirementChoice.value = ''
  componentRulesLoadError.value = false; reviewConfirmed.value = false
  notice.value = ''
}
function startEdit(space: CurriculumSpace): void {
  selectedId.value = space.id; editingId.value = space.id
  Object.assign(form, { nombre: space.nombre, carreraId: space.carreraId ?? 0, descripcion: space.descripcion ?? '', componentesIds: space.materias.map((item) => item.id) })
  originalComponentIds.value = [...form.componentesIds].sort((a, b) => a - b)
  requirementChoice.value = ''
  void loadSubjects(form.carreraId)
  void spacesApi.prerequisites(space.id).then((value) => { if (editingId.value === space.id) requirements.value = value })
  reviewConfirmed.value = false
  void loadComponentRules([...new Set([...form.componentesIds, ...originalComponentIds.value])])
  notice.value = ''
}

async function save(): Promise<void> {
  error.value = ''
  if (!form.nombre.trim() || !form.carreraId) {
    error.value = 'Ingresá un nombre y elegí una carrera.'
    return
  }
  if (!editingId.value && componentRulesLoadError.value) {
    error.value = 'No se pudieron revisar las correlatividades propias de las materias seleccionadas.'; return
  }
  const componentIds = [...form.componentesIds].sort((a, b) => a - b)
  const componentsChanged = editingId.value !== null && componentIds.join(',') !== originalComponentIds.value.join(',')
  if ((!editingId.value || componentsChanged) && componentRules.value.length && !reviewConfirmed.value) {
    error.value = 'Confirmá la revisión de las correlatividades propias antes de agrupar las materias.'; return
  }
  const destinations = createPrerequisites.value.map((item) => `${item.kind}:${item.targetId}`)
  if (!editingId.value && createHasPrerequisites.value
    && (!createPrerequisites.value.length
      || createPrerequisites.value.some((item) => !item.targetId
        || (item.kind === 'materia' ? !requiredSubjects.value.some((subject) => subject.id === item.targetId) : !eligibleSpaces.value.some((space) => space.id === item.targetId)))
      || new Set(destinations).size !== destinations.length)) {
    error.value = 'Agregá correlativas válidas de la misma carrera, sin repetir destinos.'; return
  }
  const correlatividades: SpacePrerequisiteInput[] = createHasPrerequisites.value
    ? createPrerequisites.value.map((item) => ({
      ...(item.kind === 'materia' ? { materiaRequeridaId: item.targetId } : { espacioRequeridoId: item.targetId }),
      aplicaCursado: item.aplicaCursado, aplicaRendir: item.aplicaRendir,
    })) : []
  if (!editingId.value && createHasPrerequisites.value
    && !correlatividades.length) {
    error.value = 'Agregá al menos una correlativa válida.'; return
  }
  saving.value = true
  try {
    if (editingId.value) {
      const payload = {
        nombre: form.nombre.trim(), descripcion: form.descripcion,
        ...(!latched.value && componentsChanged ? {
          componentesIds: form.componentesIds,
          ...(componentRules.value.length ? { revisarCorrelatividadesComponentes: true } : {}),
        } : {})
      }
      await spacesApi.update(editingId.value, payload)
      notice.value = latched.value ? 'Espacio actualizado. Su composición ya está bloqueada.' : 'Espacio actualizado.'
    } else {
      await spacesApi.create({
        nombre: form.nombre.trim(), carreraId: form.carreraId, descripcion: form.descripcion,
        componentesIds: form.componentesIds, correlatividades,
        ...(componentRules.value.length ? { revisarCorrelatividadesComponentes: true } : {}),
      })
      notice.value = 'Espacio curricular creado.'
    }
    await load()
    if (editingId.value) selectedId.value = editingId.value
    editingId.value = null
  } catch { error.value = 'No se pudo guardar el espacio curricular.' }
  finally { saving.value = false }
}

async function openSpace(space: CurriculumSpace): Promise<void> {
  selectedId.value = space.id; editingId.value = null; error.value = ''
  form.carreraId = space.carreraId ?? 0
  try {
    const [detail, prerequisites] = await Promise.all([spacesApi.get(space.id), spacesApi.prerequisites(space.id)])
    spaces.value = spaces.value.map((item) => item.id === detail.id ? detail : item)
    requirements.value = prerequisites
  }
  catch { error.value = 'No pudimos cargar las correlatividades del espacio.' }
}

async function activate(space: CurriculumSpace): Promise<void> {
  try {
    const detail = await spacesApi.get(space.id)
    if (detail.materias.length < 2) { error.value = 'Para activar el espacio se necesitan al menos dos materias.'; return }
    await spacesApi.activate(space.id); notice.value = 'Espacio curricular activado.'; await load()
  }
  catch { error.value = 'No se pudo activar. Verificá que tenga al menos dos materias.' }
}

async function addRequirement(): Promise<void> {
  if (!selected.value) return
  const parsed = parseRequirementChoice()
  if (!parsed || !isRequirementChoiceAvailable(parsed.kind, parsed.targetId)) { error.value = 'La correlativa elegida ya no está disponible para este espacio.'; return }
  const duplicate = requirements.value.some((item) => parsed.kind === 'materia'
    ? item.materiaRequeridaId === parsed.targetId
    : item.espacioRequeridoId === parsed.targetId)
  if (duplicate) { error.value = 'Esa correlativa ya está agregada.'; return }
  try {
    await spacesApi.addPrerequisite(selected.value.id, {
      ...(parsed.kind === 'materia' ? { materiaRequeridaId: parsed.targetId } : { espacioRequeridoId: parsed.targetId }),
      aplicaCursado: requirement.aplicaCursado, aplicaRendir: requirement.aplicaRendir,
    })
    requirementChoice.value = ''
    requirements.value = await spacesApi.prerequisites(selected.value.id)
    notice.value = 'Correlatividad obligatoria agregada.'; error.value = ''
  } catch { error.value = 'No se pudo agregar la correlatividad.' }
}

function addCreateRequirement(): void {
  const parsed = parseRequirementChoice()
  if (!parsed || !isRequirementChoiceAvailable(parsed.kind, parsed.targetId)) { error.value = 'Elegí una correlativa disponible de la misma carrera.'; return }
  if (createPrerequisites.value.some((item) => item.kind === parsed.kind && item.targetId === parsed.targetId)) {
    error.value = 'Esa correlativa ya está agregada.'; return
  }
  createPrerequisites.value.push({ ...parsed, aplicaCursado: false, aplicaRendir: true })
  requirementChoice.value = ''
  error.value = ''
}

function removeCreateRequirement(index: number): void {
  createPrerequisites.value.splice(index, 1)
}

function parseRequirementChoice(): { kind: 'materia' | 'espacio'; targetId: number } | null {
  const [kind, value] = requirementChoice.value.split(':')
  const targetId = Number(value)
  if ((kind !== 'materia' && kind !== 'espacio') || !Number.isInteger(targetId) || targetId < 1) return null
  return { kind, targetId }
}

function isRequirementChoiceAvailable(kind: 'materia' | 'espacio', targetId: number): boolean {
  return kind === 'materia'
    ? requiredSubjects.value.some((subject) => subject.id === targetId)
    : eligibleSpaces.value.some((space) => space.id === targetId)
}

function createRequirementLabel(item: { kind: 'materia' | 'espacio'; targetId: number }): string {
  const target = item.kind === 'materia'
    ? subjects.value.find((subject) => subject.id === item.targetId)
    : spaces.value.find((space) => space.id === item.targetId)
  return `${item.kind === 'materia' ? 'Materia' : 'Espacio curricular'}: ${target?.nombre ?? 'Correlativa no disponible'}`
}

function prerequisiteLabel(item: SpacePrerequisite): string {
  return item.materiaRequerida
    ? `Materia: ${item.materiaRequerida.nombre}`
    : `Espacio curricular: ${item.espacioRequerido?.nombre ?? 'Correlativa'}`
}

async function loadComponentRules(ids: number[]): Promise<void> {
  const request = ++componentRulesRequest
  componentRules.value = []
  componentRulesLoadError.value = false
  reviewConfirmed.value = false
  if (ids.length === 0) return
  try {
    const details = await Promise.all(ids.map((id) => apiClient.get<{
      nombre: string
      correlatividadesOrigen?: Array<{ suspendidaPorEspacio?: boolean; materiaRequerida?: { nombre: string } | null }>
    }>(`/materias/${id}`)))
    if (request !== componentRulesRequest) return
    componentRules.value = details.flatMap((detail) => (detail.correlatividadesOrigen ?? [])
      .filter((rule) => !rule.suspendidaPorEspacio)
      .map((rule) => ({ subjectName: detail.nombre, prerequisiteName: rule.materiaRequerida?.nombre ?? 'requisito registrado' })))
  } catch {
    if (request === componentRulesRequest) componentRulesLoadError.value = true
  }
}

async function removeRequirement(item: SpacePrerequisite): Promise<void> {
  if (!selected.value || !window.confirm('¿Quitar esta correlatividad obligatoria?')) return
  try { await spacesApi.removePrerequisite(selected.value.id, item.id); requirements.value = await spacesApi.prerequisites(selected.value.id) }
  catch { error.value = 'No se pudo quitar la correlatividad.' }
}

watch(() => form.carreraId, (careerId) => {
  requirementChoice.value = ''
  if (editingId.value === null) {
    form.componentesIds = []
    createPrerequisites.value = []
    componentRules.value = []
    reviewConfirmed.value = false
  }
  void loadSubjects(Number(careerId))
})
watch(() => [...form.componentesIds], (ids) => {
  for (const item of createPrerequisites.value) {
    if (item.kind === 'materia' && ids.includes(item.targetId)) item.targetId = 0
    if (item.kind === 'espacio') {
      const target = spaces.value.find((space) => space.id === item.targetId)
      if (target && target.materias.some((component) => ids.includes(component.id))) item.targetId = 0
    }
  }
  void loadComponentRules(editingId.value === null ? ids : [...new Set([...ids, ...originalComponentIds.value])])
})
watch(createHasPrerequisites, (enabled) => { if (!enabled) createPrerequisites.value = [] })
watch(requirementChoice, () => { error.value = '' })
onMounted(() => { void load() })
</script>

<template>
  <section aria-labelledby="spaces-title" class="space-y-5">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div><h2 id="spaces-title" class="text-2xl font-semibold">Espacios curriculares</h2><p class="mt-1 text-sm text-[var(--color-graphite)]">Configurá espacios compuestos por materias y sus correlatividades obligatorias.</p></div>
      <button type="button" class="min-h-11 rounded-lg bg-[var(--color-brand)] px-4 font-semibold text-white" @click="startCreate">Nuevo espacio curricular</button>
    </header>
    <p v-if="notice" role="status" aria-live="polite" class="rounded-lg bg-[#f2f5ee] p-3 text-sm">{{ notice }}</p>
    <p v-if="error" role="alert" class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{{ error }} <button type="button" class="ml-2 font-semibold underline" @click="load">Reintentar</button></p>
    <p v-if="loading" role="status">Cargando espacios curriculares…</p>
    <div class="grid gap-5 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.2fr)]">
      <section aria-label="Espacios registrados" class="rounded-xl border border-[var(--color-border)] bg-white p-4">
        <p v-if="!loading && !spaces.length" role="status" class="py-4 text-sm text-[var(--color-graphite)]">Todavía no hay espacios curriculares.</p>
        <ul class="space-y-2"><li v-for="space in spaces" :key="space.id" class="rounded-lg border border-[var(--color-border)] p-3" :class="selectedId === space.id ? 'bg-[#f6f7f4]' : ''">
          <button type="button" class="w-full text-left" :aria-current="selectedId === space.id ? 'true' : undefined" @click="openSpace(space)"><span class="font-semibold">{{ space.nombre }}</span><span class="block text-sm text-[var(--color-graphite)]">{{ space.carrera?.nombre ?? careers.find((career) => career.id === space.carreraId)?.nombre ?? 'Carrera' }} · {{ space.activo ? 'Activo' : 'Inactivo' }}</span></button>
          <div class="mt-2 flex gap-3 text-sm"><button type="button" class="font-semibold text-[var(--color-brand)]" @click="startEdit(space)">Editar</button><button v-if="!space.activo" type="button" class="font-semibold text-[var(--color-brand)]" @click="activate(space)">Activar</button></div>
        </li></ul>
      </section>
      <section class="rounded-xl border border-[var(--color-border)] bg-white p-5">
        <template v-if="editingId !== null || !selected">
          <h3 class="text-xl font-semibold">{{ editingId ? 'Editar espacio curricular' : 'Nuevo espacio curricular' }}</h3>
          <form class="mt-4 grid gap-4" @submit.prevent="save">
            <label class="font-semibold">Nombre<input v-model="form.nombre" required maxlength="160" class="space-input" /></label>
            <label class="font-semibold">Carrera<select v-model.number="form.carreraId" :disabled="editingId !== null" required class="space-input"><option :value="0">Seleccionar carrera</option><option v-for="career in careers" :key="career.id" :value="career.id">{{ career.nombre }}</option></select></label>
            <label class="font-semibold">Descripción<textarea v-model="form.descripcion" maxlength="1000" class="space-input min-h-24 py-2" /></label>
            <fieldset class="rounded-lg border border-[var(--color-border)] p-3" :disabled="editingId !== null && latched"><legend class="px-1 font-semibold">Materias que componen el espacio</legend><p class="text-sm text-[var(--color-graphite)]">{{ latched ? 'La composición quedó bloqueada porque el espacio ya fue completado.' : 'Podés guardar el espacio con cero o una materia; se requieren dos para activarlo.' }}</p><label v-for="subject in eligibleSubjects" :key="subject.id" class="mt-1 flex min-h-10 items-center gap-2"><input v-model="form.componentesIds" type="checkbox" :value="subject.id" /><span>Materia: {{ subject.nombre }}</span></label><p v-if="form.carreraId && !eligibleSubjects.length" class="mt-2 text-sm">No hay materias disponibles para este espacio.</p></fieldset>
            <section v-if="editingId === null" class="space-y-3 rounded-lg border border-[var(--color-border)] p-3" aria-label="Correlatividades del espacio">
              <label class="inline-flex min-h-10 items-center gap-2 font-semibold"><input v-model="createHasPrerequisites" type="checkbox" />Tiene correlativas</label>
              <template v-if="createHasPrerequisites">
                <p class="text-sm text-[var(--color-graphite)]">Elegí correlativas de la misma carrera. Se aplican para rendir, como en Materias.</p>
                <div class="flex flex-col gap-2 sm:flex-row">
                  <label for="space-create-prerequisite" class="sr-only">Correlativa</label>
                  <select id="space-create-prerequisite" v-model="requirementChoice" class="space-input min-w-0 flex-1" :disabled="!form.carreraId">
                    <option value="">Seleccioná una correlativa</option>
                    <optgroup label="Materias"><option v-for="subject in requiredSubjects" :key="subject.id" :value="`materia:${subject.id}`">{{ subject.nombre }}</option></optgroup>
                    <optgroup label="Espacios curriculares"><option v-for="space in eligibleSpaces" :key="space.id" :value="`espacio:${space.id}`">{{ space.nombre }}</option></optgroup>
                  </select>
                  <button type="button" class="min-h-11 rounded-lg border border-[var(--color-brand)] px-4 font-semibold text-[var(--color-brand)] disabled:opacity-50" :disabled="!requirementChoice" @click="addCreateRequirement">Agregar</button>
                </div>
                <ul v-if="createPrerequisites.length" class="space-y-2">
                  <li v-for="(item, index) in createPrerequisites" :key="`${item.kind}:${item.targetId}`" class="flex items-center justify-between gap-3 rounded-lg bg-[#f6f7f4] p-3 text-sm">
                    <span>{{ createRequirementLabel(item) }}</span>
                    <button type="button" class="min-h-9 rounded px-2 font-semibold text-[var(--color-brand)] underline" :aria-label="`Quitar ${createRequirementLabel(item)}`" @click="removeCreateRequirement(index)">Quitar</button>
                  </li>
                </ul>
                <p v-else class="text-sm text-[var(--color-graphite)]">Todavía no agregaste correlativas.</p>
              </template>
            </section>
            <fieldset v-if="componentRules.length" class="rounded-lg border border-amber-300 bg-amber-50 p-3">
              <legend class="px-1 font-semibold">Revisión de correlatividades de las materias</legend>
              <p class="text-sm">Al guardar, estas reglas propias dejarán de regir y se conservarán suspendidas:</p>
              <ul class="mt-2 list-inside list-disc text-sm"><li v-for="(rule, index) in componentRules" :key="`${rule.subjectName}-${rule.prerequisiteName}-${index}`">{{ rule.subjectName }} → {{ rule.prerequisiteName }}</li></ul>
              <label class="mt-2 inline-flex min-h-10 items-center gap-2"><input v-model="reviewConfirmed" type="checkbox" />Revisé estas reglas y confirmo el cambio de composición</label>
            </fieldset>
            <p v-if="componentRulesLoadError" role="alert" class="text-sm text-red-800">No se pudieron revisar las correlatividades propias. Volvé a cargar la selección antes de guardar.</p>
            <section v-if="editingId !== null" class="space-y-3 rounded-lg border border-[var(--color-border)] p-3" aria-label="Correlatividades del espacio">
              <h4 class="font-semibold">Correlativas</h4>
              <ul v-if="requirements.length" class="space-y-2"><li v-for="item in requirements" :key="item.id" class="flex items-center justify-between gap-3 rounded-lg bg-[#f6f7f4] p-3 text-sm"><span>{{ prerequisiteLabel(item) }}</span><button type="button" class="min-h-9 rounded px-2 font-semibold text-[var(--color-brand)] underline" :aria-label="`Quitar ${prerequisiteLabel(item)}`" @click="removeRequirement(item)">Quitar</button></li></ul>
              <p v-else class="text-sm text-[var(--color-graphite)]">No hay correlativas.</p>
              <div class="flex flex-col gap-2 sm:flex-row"><label for="space-edit-prerequisite" class="sr-only">Correlativa</label><select id="space-edit-prerequisite" v-model="requirementChoice" class="space-input min-w-0 flex-1"><option value="">Seleccioná una correlativa</option><optgroup label="Materias"><option v-for="subject in requiredSubjects" :key="subject.id" :value="`materia:${subject.id}`">{{ subject.nombre }}</option></optgroup><optgroup label="Espacios curriculares"><option v-for="space in eligibleSpaces" :key="space.id" :value="`espacio:${space.id}`">{{ space.nombre }}</option></optgroup></select><button type="button" class="min-h-11 rounded-lg border border-[var(--color-brand)] px-4 font-semibold text-[var(--color-brand)] disabled:opacity-50" :disabled="!requirementChoice" @click="addRequirement">Agregar</button></div>
            </section>
            <div class="flex flex-wrap gap-2"><button type="submit" class="min-h-11 rounded-lg bg-[var(--color-brand)] px-4 font-semibold text-white" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar espacio' }}</button><button v-if="editingId" type="button" class="min-h-11 rounded-lg border border-[var(--color-border)] px-4" @click="selected ? (editingId = null) : startCreate()">Cancelar</button></div>
          </form>
        </template>
        <template v-else>
          <div class="flex flex-wrap items-start justify-between gap-3"><div><h3 class="text-xl font-semibold">{{ selected.nombre }}</h3><p class="text-sm text-[var(--color-graphite)]">{{ selected.carrera?.nombre ?? 'Carrera' }} · {{ selected.activo ? 'Activo' : 'Inactivo' }}</p></div><button type="button" class="min-h-10 rounded-lg border border-[var(--color-border)] px-3 font-semibold" @click="startEdit(selected)">Editar</button></div>
          <h4 class="mt-5 font-semibold">Materias del espacio</h4><ul class="mt-2 list-inside list-disc text-sm"><li v-for="item in selected.materias" :key="item.id">Materia: {{ item.nombre }}</li></ul>
          <h4 class="mt-5 font-semibold">Correlatividades obligatorias</h4>
          <ul class="mt-2 space-y-2"><li v-for="item in requirements" :key="item.id" class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#f6f7f4] p-3 text-sm"><span>{{ prerequisiteLabel(item) }}<span class="block text-[var(--color-graphite)]">{{ [item.aplicaCursado && 'Cursado', item.aplicaRendir && 'Rendir'].filter(Boolean).join(' · ') }}</span></span><button type="button" class="min-h-9 text-[var(--color-brand)] underline" @click="removeRequirement(item)">Quitar</button></li></ul>
          <p v-if="!requirements.length" class="mt-2 text-sm text-[var(--color-graphite)]">No hay correlatividades obligatorias.</p>
          <form class="mt-4 space-y-3 border-t border-[var(--color-border)] pt-4" @submit.prevent="addRequirement">
            <label for="space-detail-prerequisite" class="sr-only">Correlativa</label>
            <select id="space-detail-prerequisite" v-model="requirementChoice" class="space-input"><option value="">Seleccioná una correlativa</option><optgroup label="Materias"><option v-for="subject in requiredSubjects" :key="subject.id" :value="`materia:${subject.id}`">{{ subject.nombre }}</option></optgroup><optgroup label="Espacios curriculares"><option v-for="space in eligibleSpaces" :key="space.id" :value="`espacio:${space.id}`">{{ space.nombre }}</option></optgroup></select>
            <p class="text-sm text-[var(--color-graphite)]">La correlativa nueva aplica para rendir, igual que las reglas predeterminadas de Materias.</p>
            <button type="submit" class="min-h-11 rounded-lg bg-[var(--color-brand)] px-4 font-semibold text-white" :disabled="!requirementChoice">Agregar</button>
          </form>
        </template>
      </section>
    </div>
  </section>
</template>

<style scoped>
.space-input { margin-top: .25rem; min-height: 2.75rem; width: 100%; border: 1px solid var(--color-border); border-radius: .5rem; padding: 0 .75rem; font-weight: 400; }
</style>
