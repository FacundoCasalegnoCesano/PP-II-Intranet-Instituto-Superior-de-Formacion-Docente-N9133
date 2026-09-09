<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { PaginationMeta } from '@/core/api/contracts'
import AppButton from '@/ui/AppButton.vue'
import { getCareerStudyPlan, listCareerCatalog } from '../api/careerCatalogApi'
import type { CareerStudyPlan, CatalogCareer, StudyPlanSubject } from '../types/careerCatalog'
const PAGE_LIMIT = 20
const careers = ref<CatalogCareer[]>([])
const pagination = ref<PaginationMeta>({ page: 1, limit: PAGE_LIMIT, total: 0, totalPages: 0 })
const searchInput = ref('')
const appliedSearch = ref('')
const selectedCareerId = ref<number | null>(null)
const selectedPlan = ref<CareerStudyPlan | null>(null)
const loadingCatalog = ref(false)
const catalogError = ref('')
const loadingPlan = ref(false)
const planError = ref('')
let catalogGeneration = 0
let planGeneration = 0
const selectedCareer = computed(() => careers.value.find((career) => career.id === selectedCareerId.value) ?? null)
const selectedCareerDetails = computed(() => selectedCareer.value ?? selectedPlan.value)
const groupedSubjects = computed(() => {
  const groups = new Map<number, StudyPlanSubject[]>()
  for (const subject of selectedPlan.value?.materias ?? []) {
    const year = subject.curso?.anio && subject.curso.anio > 0 ? subject.curso.anio : 0
    groups.set(year, [...(groups.get(year) ?? []), subject])
  }
  return [...groups.entries()]
    .sort(([firstYear], [secondYear]) => {
      if (firstYear === 0) return 1
      if (secondYear === 0) return -1
      return firstYear - secondYear
    })
    .map(([year, subjects]) => ({
      key: year,
      label: year === 0 ? 'Sin año asignado' : `${year}.º año`,
      subjects,
    }))
})
function clearPlan(clearSelection = false) {
  planGeneration += 1
  selectedPlan.value = null
  loadingPlan.value = false
  planError.value = ''
  if (clearSelection) selectedCareerId.value = null
}
async function loadPlan(careerId: number) {
  const generation = ++planGeneration
  selectedPlan.value = null
  planError.value = ''
  loadingPlan.value = true
  try {
    const plan = await getCareerStudyPlan(careerId)
    if (generation !== planGeneration || selectedCareerId.value !== careerId) return
    selectedPlan.value = plan
  } catch {
    if (generation !== planGeneration || selectedCareerId.value !== careerId) return
    planError.value = 'No pudimos cargar el plan de estudio.'
  } finally {
    if (generation === planGeneration && selectedCareerId.value === careerId) loadingPlan.value = false
  }
}
function selectCareer(career: CatalogCareer) {
  selectedCareerId.value = career.id
  void loadPlan(career.id)
}
async function loadCatalog(page = pagination.value.page) {
  const generation = ++catalogGeneration
  loadingCatalog.value = true
  catalogError.value = ''
  careers.value = []
  pagination.value = { ...pagination.value, page, limit: PAGE_LIMIT }
  clearPlan()

  try {
    const result = await listCareerCatalog({ page, limit: PAGE_LIMIT, search: appliedSearch.value })
    if (generation !== catalogGeneration) return

    careers.value = result.data
    pagination.value = result.pagination
    if (!result.data.length) {
      clearPlan(true)
      return
    }

    const selected = result.data.find((career) => career.id === selectedCareerId.value) ?? result.data[0]
    selectCareer(selected)
  } catch {
    if (generation !== catalogGeneration) return
    careers.value = []
    clearPlan(true)
    catalogError.value = 'No pudimos cargar el catálogo de carreras.'
  } finally {
    if (generation === catalogGeneration) loadingCatalog.value = false
  }
}

function submitSearch() {
  appliedSearch.value = searchInput.value.trim()
  pagination.value = { ...pagination.value, page: 1 }
  void loadCatalog(1)
}

function changePage(page: number) {
  if (page < 1 || page > pagination.value.totalPages || page === pagination.value.page) return
  void loadCatalog(page)
}

function retryPlan() {
  if (selectedCareerId.value !== null) void loadPlan(selectedCareerId.value)
}

onMounted(() => {
  void loadCatalog(1)
})
</script>

<template>
  <main aria-labelledby="career-catalog-title" class="mx-auto max-w-6xl text-[var(--color-text)]">
    <header>
      <p class="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--color-brand)]">Oferta académica</p>
      <h1 id="career-catalog-title" class="mt-2 text-3xl font-semibold">Carreras y planes de estudio</h1>
      <p class="mt-2 max-w-2xl text-[var(--color-graphite)]">Consultá las carreras activas y las materias que integran cada plan de estudio.</p>
    </header>

    <div class="mt-7 grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <section aria-labelledby="catalog-title" class="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-6">
        <h2 id="catalog-title" class="text-xl font-semibold">Catálogo de carreras</h2>
        <form class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" @submit.prevent="submitSearch">
          <label class="flex-1 text-sm font-semibold" for="career-search">
            Buscar carrera
            <input id="career-search" v-model="searchInput" type="search" class="mt-1 min-h-11 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 font-normal text-[var(--color-text)]" />
          </label>
          <AppButton type="submit">Buscar</AppButton>
        </form>

        <div class="mt-5">
          <p v-if="loadingCatalog" role="status" aria-live="polite" class="rounded-lg bg-[var(--color-background)] p-4 text-[var(--color-graphite)]">Cargando carreras…</p>
          <div v-else-if="catalogError" role="alert" class="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
            <p>{{ catalogError }}</p>
            <AppButton class="mt-3" @click="loadCatalog()">Reintentar catálogo</AppButton>
          </div>
          <p v-else-if="!careers.length" class="rounded-lg border border-dashed border-[var(--color-border)] p-4 text-[var(--color-graphite)]">No hay carreras activas para mostrar.</p>
          <ul v-else class="space-y-2" aria-label="Carreras disponibles">
            <li v-for="career in careers" :key="career.id">
              <button
                type="button"
                :aria-pressed="career.id === selectedCareerId"
                class="w-full rounded-lg border p-4 text-left transition-colors"
                :class="career.id === selectedCareerId ? 'border-[var(--color-brand)] bg-[#fff7f6] text-[var(--color-brand)]' : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-background)]'"
                @click="selectCareer(career)"
              >
                <span class="block font-semibold">{{ career.nombre }}</span>
                <span class="mt-1 block text-sm text-[var(--color-graphite)]">{{ career.duracionAnios }} años</span>
              </button>
            </li>
          </ul>
        </div>

        <nav v-if="!loadingCatalog && !catalogError && pagination.totalPages > 1" class="mt-5 flex items-center justify-between gap-3 text-sm" aria-label="Paginación">
          <span class="text-[var(--color-graphite)]">Página {{ pagination.page }} de {{ pagination.totalPages }}</span>
          <div class="flex gap-2">
            <AppButton variant="secondary" :disabled="pagination.page <= 1" @click="changePage(pagination.page - 1)">Anterior</AppButton>
            <AppButton variant="secondary" :disabled="pagination.page >= pagination.totalPages" @click="changePage(pagination.page + 1)">Siguiente</AppButton>
          </div>
        </nav>
      </section>

      <section aria-labelledby="study-plan-title" class="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-6">
        <h2 id="study-plan-title" class="text-xl font-semibold">Plan de estudio</h2>
        <template v-if="selectedCareerDetails">
          <p class="mt-2 text-lg font-semibold">{{ selectedCareerDetails.nombre }}</p>
          <p class="text-[var(--color-graphite)]">{{ selectedCareerDetails.duracionAnios }} años</p>
        </template>

        <p v-if="!selectedCareerId" class="mt-5 text-[var(--color-graphite)]">Seleccioná una carrera para consultar su plan.</p>
        <p v-else-if="loadingPlan" role="status" aria-live="polite" class="mt-5 rounded-lg bg-[var(--color-background)] p-4 text-[var(--color-graphite)]">Cargando plan de estudio…</p>
        <div v-else-if="planError" role="alert" class="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          <p>{{ planError }}</p>
          <AppButton class="mt-3" @click="retryPlan">Reintentar plan</AppButton>
        </div>
        <p v-else-if="selectedPlan && !selectedPlan.materias.length" class="mt-5 text-[var(--color-graphite)]">No hay materias cargadas en este plan.</p>
        <div v-else-if="selectedPlan" class="mt-5 space-y-5">
          <section v-for="group in groupedSubjects" :key="group.key" :aria-labelledby="`year-${group.key}`">
            <h3 :id="`year-${group.key}`" class="font-semibold">{{ group.label }}</h3>
            <ul class="mt-2 grid gap-3 sm:grid-cols-2" role="list">
              <li v-for="subject in group.subjects" :key="subject.id" class="rounded-lg bg-[var(--color-background)] p-4">
                <p class="font-semibold">{{ subject.nombre }}</p>
                <p class="mt-1 text-sm text-[var(--color-graphite)]">{{ subject.cargaHoraria }} h</p>
                <p class="text-sm text-[var(--color-graphite)]">{{ subject.tipoEspacio }}</p>
              </li>
            </ul>
          </section>
        </div>
      </section>
    </div>
  </main>
</template>
