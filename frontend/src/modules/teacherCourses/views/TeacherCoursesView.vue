<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppButton from '@/ui/AppButton.vue'
import { academicLabel } from '@/core/presentation/academicLabels'
import { teacherCoursesApi } from '../api/teacherCoursesApi'
import TeacherCourseList from '../components/TeacherCourseList.vue'
import TeacherCourseSectionNav from '../components/TeacherCourseSectionNav.vue'
import TeacherStudentsTable from '../components/TeacherStudentsTable.vue'
import ClassRegister from '../components/ClassRegister.vue'
import GradesGrid from '../components/GradesGrid.vue'
import AcademicSummaryTable from '../components/AcademicSummaryTable.vue'
import type { AcademicSummary, ClassSummary, EnrolledStudent, GradeRecord, SaveGradesPayload, TeacherCourse, TeacherCourseSection } from '../types/teacherCourses'

const route = useRoute()
const router = useRouter()
const currentYear = Number(new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric',
}).format(new Date()))
const years = Array.from({ length: 7 }, (_, index) => currentYear - index)

function yearFromRoute(): number {
  const rawYear = Array.isArray(route.query.anioLectivo) ? route.query.anioLectivo[0] : route.query.anioLectivo
  const year = Number(rawYear)
  return Number.isInteger(year) && year > 0 ? year : currentYear
}

const selectedYear = ref(yearFromRoute())
const courses = ref<TeacherCourse[]>([])
const selectedCourse = ref<TeacherCourse | null>(null)
const students = ref<EnrolledStudent[]>([])
const classHistory = ref<ClassSummary[]>([])
const grades = ref<GradeRecord[]>([])
const academicSummary = ref<AcademicSummary | null>(null)
const gradeActionError = ref('')
const gradeRefreshCourseId = ref<number | null>(null)
const savingGrades = ref(false)
const loading = ref(false)
const loadingSelection = ref(false)
const error = ref('')
const selectionError = ref('')
const staleResponsesDiscarded = ref(0)
let listRequest = 0
let selectionRequest = 0

const routeSection = computed<TeacherCourseSection>(() => {
  if (route.name === 'teacher-course-classes') return 'classes'
  if (route.name === 'teacher-course-grades') return 'grades'
  if (route.name === 'teacher-course-summary') return 'summary'
  if (route.name === 'teacher-course-students') return 'students'
  if (route.query.seccion === 'clases') return 'classes'
  if (route.query.seccion === 'calificaciones') return 'grades'
  if (route.query.seccion === 'resumen') return 'summary'
  return 'students'
})
const isList = computed(() => route.params.id === undefined)
const courseStatus = computed(() => selectedCourse.value && courseIsCurrent(selectedCourse.value) ? 'Cursada actual' : 'Cursada histórica')
const sectionTitle = computed(() => ({ students: 'Alumnos inscriptos', classes: 'Clases', grades: 'Calificaciones', summary: 'Resumen académico' })[routeSection.value])
const sectionRoutes: Record<TeacherCourseSection, string> = {
  students: 'teacher-course-students',
  classes: 'teacher-course-classes',
  grades: 'teacher-course-grades',
  summary: 'teacher-course-summary',
}

function courseIsCurrent(course: TeacherCourse): boolean {
  return (course.editable ?? (course.activo && course.anioLectivo === currentYear)) && course.anioLectivo === currentYear
}

async function loadCourses(): Promise<void> {
  const request = ++listRequest
  loading.value = true
  error.value = ''
  courses.value = []
  try {
    const result = await teacherCoursesApi.list({ anioLectivo: selectedYear.value })
    if (request !== listRequest) {
      staleResponsesDiscarded.value += 1
      return
    }
    courses.value = result.data
  } catch {
    if (request !== listRequest) {
      staleResponsesDiscarded.value += 1
      return
    }
    error.value = 'No pudimos cargar las cursadas.'
  } finally {
    if (request === listRequest) loading.value = false
  }
}

async function loadSelection(): Promise<void> {
  const id = Number(route.params.id)
  if (!id) return
  const request = ++selectionRequest
  loadingSelection.value = true
  selectionError.value = ''
  selectedCourse.value = null
  students.value = []
  classHistory.value = []
  grades.value = []
  academicSummary.value = null
  gradeActionError.value = ''
  gradeRefreshCourseId.value = null
  savingGrades.value = false
  try {
    const course = await teacherCoursesApi.get(id)
    if (request !== selectionRequest) {
      staleResponsesDiscarded.value += 1
      return
    }
    selectedCourse.value = course
    if (routeSection.value === 'students' || routeSection.value === 'classes' || routeSection.value === 'grades' || routeSection.value === 'summary') {
      const [enrolledStudents, history, loadedGrades, loadedSummary] = await Promise.all([
        routeSection.value === 'students' || routeSection.value === 'classes' || routeSection.value === 'grades'
          ? teacherCoursesApi.listStudents(id)
          : Promise.resolve<EnrolledStudent[]>([]),
        routeSection.value === 'classes' && typeof teacherCoursesApi.listClasses === 'function'
          ? teacherCoursesApi.listClasses(id)
          : Promise.resolve<ClassSummary[]>([]),
        routeSection.value === 'grades'
          ? teacherCoursesApi.listGrades(id)
          : Promise.resolve<GradeRecord[]>([]),
        routeSection.value === 'summary'
          ? teacherCoursesApi.getAcademicSummary(id)
          : Promise.resolve<AcademicSummary | null>(null),
      ])
      if (request !== selectionRequest) {
        staleResponsesDiscarded.value += 1
        return
      }
      students.value = enrolledStudents ?? []
      classHistory.value = history ?? []
      grades.value = loadedGrades ?? []
      academicSummary.value = loadedSummary
    }
  } catch {
    if (request !== selectionRequest) {
      staleResponsesDiscarded.value += 1
      return
    }
    selectionError.value = 'No pudimos cargar la cursada seleccionada.'
  } finally {
    if (request === selectionRequest) loadingSelection.value = false
  }
}

async function saveGrades(payload: SaveGradesPayload): Promise<void> {
  const course = selectedCourse.value
  if (!course || !courseIsCurrent(course) || savingGrades.value) return
  const request = selectionRequest
  savingGrades.value = true
  gradeActionError.value = ''
  gradeRefreshCourseId.value = null
  try {
    await teacherCoursesApi.saveGrades(payload)
  } catch {
    if (request === selectionRequest) gradeActionError.value = 'No pudimos guardar las calificaciones. Revisá los datos e intentá nuevamente.'
    if (request === selectionRequest) savingGrades.value = false
    return
  }

  try {
    const refreshedGrades = await teacherCoursesApi.listGrades(payload.cursadaId)
    if (request !== selectionRequest || selectedCourse.value?.id !== payload.cursadaId) {
      staleResponsesDiscarded.value += 1
      return
    }
    grades.value = refreshedGrades
  } catch {
    if (request === selectionRequest && selectedCourse.value?.id === payload.cursadaId) {
      gradeActionError.value = 'Las calificaciones se guardaron, pero no pudimos actualizar la vista. Podés reintentar la actualización.'
      gradeRefreshCourseId.value = payload.cursadaId
    }
  } finally {
    if (request === selectionRequest) savingGrades.value = false
  }
}

async function retryGradeRefresh(): Promise<void> {
  const courseId = gradeRefreshCourseId.value
  const request = selectionRequest
  if (courseId === null || selectedCourse.value?.id !== courseId || savingGrades.value) return
  savingGrades.value = true
  gradeActionError.value = ''
  try {
    const refreshedGrades = await teacherCoursesApi.listGrades(courseId)
    if (request !== selectionRequest || selectedCourse.value?.id !== courseId) {
      staleResponsesDiscarded.value += 1
      return
    }
    grades.value = refreshedGrades
    gradeRefreshCourseId.value = null
  } catch {
    if (request === selectionRequest && selectedCourse.value?.id === courseId) {
      gradeActionError.value = 'Las calificaciones se guardaron, pero no pudimos actualizar la vista. Podés reintentar la actualización.'
    }
  } finally {
    if (request === selectionRequest) savingGrades.value = false
  }
}

function selectCourse(course: TeacherCourse): void {
  void router.push({
    name: sectionRoutes[routeSection.value],
    params: { id: course.id },
    query: { anioLectivo: String(selectedYear.value) },
  })
}

function changeYear(): void {
  void router.push({ name: 'teacher-courses', query: { ...route.query, anioLectivo: String(selectedYear.value) } })
}

function retry(): void {
  if (isList.value) void loadCourses()
  else void loadSelection()
}

watch(() => route.fullPath, () => {
  selectedYear.value = yearFromRoute()
  if (isList.value) void loadCourses()
  else void loadSelection()
})

onMounted(() => {
  if (isList.value) void loadCourses()
  else void loadSelection()
})
</script>

<template>
  <main aria-labelledby="teacher-courses-title" class="mx-auto max-w-6xl text-[var(--color-text)]">
    <header>
      <p class="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--color-brand)]">Espacio docente</p>
      <h1 id="teacher-courses-title" class="mt-2 text-3xl font-semibold">Mis cursadas</h1>
      <p class="mt-2 max-w-2xl text-[var(--color-graphite)]">Consultá tus cursadas, alumnos y la información académica calculada por la institución.</p>
    </header>

    <p v-if="staleResponsesDiscarded" class="mt-3 text-sm text-[var(--color-graphite)]" role="status" aria-live="polite">Solicitudes obsoletas descartadas: {{ staleResponsesDiscarded }}</p>

    <template v-if="isList">
      <section class="mt-7 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-6" aria-labelledby="course-list-title">
        <div class="flex flex-wrap items-end justify-between gap-4">
          <div><h2 id="course-list-title" class="text-xl font-semibold">Cursadas disponibles</h2><p class="mt-1 text-sm text-[var(--color-graphite)]">Elegí el ciclo lectivo para consultar también tu historial.</p></div>
          <label class="block min-w-48 text-sm font-semibold" for="teacher-course-year">Año lectivo<select id="teacher-course-year" v-model.number="selectedYear" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-3 font-normal" @change="changeYear"><option v-for="year in years" :key="year" :value="year">{{ year }}{{ year === currentYear ? ' (actual)' : '' }}</option></select></label>
        </div>
        <div v-if="loading" class="mt-5 rounded-lg border border-[var(--color-border)] bg-white p-5 text-[var(--color-graphite)]" role="status" aria-busy="true" aria-live="polite">Cargando cursadas…</div>
        <div v-else-if="error" class="mt-5 rounded-lg border border-[#edb8b8] bg-[#fff4f4] p-5 text-[#8b151b]" role="alert"><p>{{ error }}</p><AppButton class="mt-4" variant="secondary" @click="retry">Reintentar</AppButton></div>
        <p v-else-if="!courses.length" class="mt-5 rounded-lg border border-dashed border-[var(--color-border)] bg-white p-5 text-[var(--color-graphite)]" role="status">No hay cursadas para el año seleccionado.</p>
        <TeacherCourseList v-else :courses="courses" :current-year="currentYear" :section="routeSection" @select="selectCourse" />
      </section>
    </template>

    <template v-else>
      <section class="mt-7 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-6" aria-labelledby="selected-course-title">
        <div v-if="loadingSelection" role="status" aria-busy="true" aria-live="polite">Cargando cursada…</div>
        <div v-else-if="selectionError" role="alert"><p>{{ selectionError }}</p><AppButton class="mt-4" variant="secondary" @click="retry">Reintentar</AppButton></div>
        <template v-else-if="selectedCourse">
          <div class="flex flex-wrap items-start justify-between gap-4"><div><h2 id="selected-course-title" class="text-2xl font-semibold">{{ selectedCourse.materia.nombre }}</h2><p class="mt-1 text-[var(--color-graphite)]">{{ selectedCourse.materia.carrera?.nombre ?? 'Carrera no informada' }} · {{ selectedCourse.anioLectivo }} · {{ academicLabel(selectedCourse.periodo) }}</p></div><p class="font-semibold" :class="courseIsCurrent(selectedCourse) ? 'text-[var(--color-brand)]' : 'text-[var(--color-graphite)]'">{{ courseStatus }}</p></div>
          <TeacherCourseSectionNav class="mt-6" :course-id="selectedCourse.id" :section="routeSection" :anio-lectivo="selectedYear" />
          <section v-if="routeSection === 'students'" aria-labelledby="students-title"><h3 id="students-title" class="mt-6 text-xl font-semibold">Alumnos inscriptos</h3><div v-if="!students.length" class="mt-5 rounded-lg border border-dashed border-[var(--color-border)] p-5 text-[var(--color-graphite)]" role="status">No hay alumnos inscriptos en esta cursada.</div><TeacherStudentsTable v-else :students="students" :course-id="selectedCourse.id" :anio-lectivo="selectedYear" /></section>
          <ClassRegister v-else-if="routeSection === 'classes'" :course="selectedCourse" :students="students" :classes="classHistory" />
          <template v-else-if="routeSection === 'grades'">
            <GradesGrid :course="selectedCourse" :students="students" :grades="grades" :saving="savingGrades" @save="saveGrades" />
            <div v-if="gradeActionError" class="mt-4 rounded-md border border-[#edb8b8] bg-[#fff4f4] p-3 text-sm text-[#8b151b]" role="alert">
              <p>{{ gradeActionError }}</p>
              <AppButton v-if="gradeRefreshCourseId === selectedCourse.id" class="mt-3" variant="secondary" @click="retryGradeRefresh">Reintentar actualización</AppButton>
            </div>
          </template>
          <AcademicSummaryTable v-else-if="routeSection === 'summary' && academicSummary" :summary="academicSummary" />
          <p v-else-if="routeSection === 'summary'" class="mt-6 rounded-lg border border-dashed border-[var(--color-border)] p-5 text-[var(--color-graphite)]" role="status">No hay resumen académico disponible.</p>
          <section v-else class="mt-6 rounded-lg border border-[var(--color-border)] bg-white p-5" role="status"><h3 class="text-xl font-semibold">{{ sectionTitle }}</h3><p class="mt-2 text-[var(--color-graphite)]">Esta sección se habilitará en una tarea posterior.</p></section>
        </template>
      </section>
    </template>
  </main>
</template>
