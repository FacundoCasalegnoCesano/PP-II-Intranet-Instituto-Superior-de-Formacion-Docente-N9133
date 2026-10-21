<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { apiClient } from '@/core/api/client'
import { normalizeApiError, apiErrorMessage } from '@/core/api/errors'
import { adminApi } from '@/modules/admin/api/adminApi'
import { fetchAdminStudents } from '@/modules/adminAcademicRecords/api/adminAcademicRecordsApi'
import type { AdminAcademicStudent } from '@/modules/adminAcademicRecords/types/adminAcademicRecords'
import { teacherCoursesApi } from '@/modules/teacherCourses/api/teacherCoursesApi'
import GradesGrid from '@/modules/teacherCourses/components/GradesGrid.vue'
import type { EnrolledStudent, GradeRecord, SaveGradesPayload } from '@/modules/teacherCourses/types/teacherCourses'
import { INSTITUTIONAL_TIME_ZONE } from '@/modules/examManagement/presentation'

interface AvailableCourse {
  id: number
  anioLectivo: number
  materia: {
    id: number
    nombre: string
    carrera: { id: number; nombre: string }
  }
  espacioCurricular?: { id: number; nombre: string } | null
}

type AvailableCourseResponse = Omit<AvailableCourse, 'id'> & { cursadaId: number }

const institutionalYear = Number(new Intl.DateTimeFormat('en-CA', { timeZone: INSTITUTIONAL_TIME_ZONE, year: 'numeric' }).format(new Date()))
const year = ref(String(institutionalYear))
const courses = ref<AvailableCourse[]>([])
const selectedCourseId = ref<number | null>(null)
const students = ref<EnrolledStudent[]>([])
const selectedStudentId = ref<number | null>(null)
const grades = ref<GradeRecord[]>([])
const loadingCourses = ref(false)
const loadingWorkspace = ref(false)
const saving = ref(false)
const error = ref('')
const success = ref('')
const historicalStudentSearch = ref('')
const historicalStudents = ref<AdminAcademicStudent[]>([])
const historicalStudentId = ref<number | null>(null)
const loadingHistoricalStudents = ref(false)
const savingHistoricalEnrollment = ref(false)
const historicalEnrollmentError = ref('')
const historicalEnrollmentMessage = ref('')
const loadSequence = ref(0)
let historicalSearchSequence = 0
const selectedCourse = computed(() => courses.value.find(item => item.id === selectedCourseId.value) ?? null)
const selectedStudent = computed(() => students.value.find(student => student.alumnoId === selectedStudentId.value) ?? null)
const isHistoricalCourse = computed(() => Boolean(selectedCourse.value && selectedCourse.value.anioLectivo < institutionalYear))
const availableHistoricalStudents = computed(() => historicalStudents.value.filter(student => !students.value.some(enrolled => enrolled.alumnoId === student.idUsuario)))

async function loadCourses(): Promise<void> {
  const parsedYear = Number(year.value)
  if (!Number.isInteger(parsedYear) || parsedYear < 1) {
    error.value = 'Ingresá un año lectivo válido.'
    return
  }
  loadingCourses.value = true
  loadSequence.value += 1
  loadingWorkspace.value = false
  error.value = ''
  success.value = ''
  selectedCourseId.value = null
  selectedStudentId.value = null
  students.value = []
  grades.value = []
  try {
    const available = await apiClient.get<AvailableCourseResponse[]>(`/calificaciones/cursadas-disponibles?anioLectivo=${parsedYear}`)
    courses.value = available.map(({ cursadaId, ...course }) => ({ ...course, id: cursadaId }))
  } catch {
    error.value = 'No pudimos cargar las cursadas de ese ciclo.'
  } finally {
    loadingCourses.value = false
  }
}

async function loadWorkspace(courseId: number | null): Promise<void> {
  if (!courseId) return
  historicalSearchSequence += 1
  historicalStudentSearch.value = ''
  historicalStudents.value = []
  historicalStudentId.value = null
  loadingHistoricalStudents.value = false
  historicalEnrollmentError.value = ''
  historicalEnrollmentMessage.value = ''
  const sequence = ++loadSequence.value
  loadingWorkspace.value = true
  error.value = ''
  success.value = ''
  students.value = []
  grades.value = []
  selectedStudentId.value = null
  try {
    const nextStudents = await teacherCoursesApi.listStudents(courseId)
    if (sequence !== loadSequence.value) return
    students.value = nextStudents
  } catch {
    if (sequence === loadSequence.value) error.value = 'No pudimos cargar los alumnos de la cursada.'
  } finally {
    if (sequence === loadSequence.value) loadingWorkspace.value = false
  }
}

async function searchHistoricalStudents(): Promise<void> {
  const course = selectedCourse.value
  const careerId = course?.materia.carrera?.id
  const search = historicalStudentSearch.value.trim()
  const request = ++historicalSearchSequence
  historicalStudents.value = []
  historicalStudentId.value = null
  historicalEnrollmentError.value = ''
  historicalEnrollmentMessage.value = ''
  if (!course || !isHistoricalCourse.value || !careerId) {
    historicalEnrollmentError.value = 'La cursada no tiene una carrera asociada para buscar alumnos.'
    return
  }
  if (search.length < 2) {
    historicalEnrollmentError.value = 'Ingresá al menos 2 caracteres del nombre o el DNI.'
    return
  }

  loadingHistoricalStudents.value = true
  try {
    const result = await fetchAdminStudents({ search, carreraId: careerId, limit: 50 })
    if (request !== historicalSearchSequence || selectedCourseId.value !== course.id) return
    historicalStudents.value = result.data
  } catch (cause) {
    if (request === historicalSearchSequence && selectedCourseId.value === course.id) {
      historicalEnrollmentError.value = apiErrorMessage(cause, 'No pudimos buscar alumnos inscriptos en la carrera.')
    }
  } finally {
    if (request === historicalSearchSequence) loadingHistoricalStudents.value = false
  }
}

async function enrollHistoricalStudent(): Promise<void> {
  const course = selectedCourse.value
  const studentId = historicalStudentId.value
  const student = availableHistoricalStudents.value.find(item => item.idUsuario === studentId)
  if (!course || !isHistoricalCourse.value || studentId === null || !student || savingHistoricalEnrollment.value) return

  savingHistoricalEnrollment.value = true
  historicalEnrollmentError.value = ''
  historicalEnrollmentMessage.value = ''
  try {
    const result = await adminApi.enrollHistoricalCourse(course.id, studentId)
    if (selectedCourseId.value !== course.id) return
    await loadWorkspace(course.id)
    if (selectedCourseId.value !== course.id) return
    const enrolledStudent = students.value.find(item => item.alumnoId === studentId)
    if (enrolledStudent) {
      selectedStudentId.value = studentId
      await loadStudentGrades(studentId)
    }
    if (selectedCourseId.value !== course.id) return
    historicalEnrollmentMessage.value = result.message ?? `Se agregó a ${student.apellidoNombre} a la nómina de la cursada.`
  } catch (cause) {
    if (selectedCourseId.value !== course.id) return
    const normalized = normalizeApiError(cause)
    if (normalized.status === 409) {
      await loadWorkspace(course.id)
      if (selectedCourseId.value !== course.id) return
      const serverMessage = apiErrorMessage(cause, 'No se pudo agregar al alumno a la cursada histórica.')
      const nowEnrolled = students.value.some(item => item.alumnoId === studentId)
      historicalEnrollmentError.value = nowEnrolled
        ? `${serverMessage} La nómina se actualizó y el alumno ya figura en la cursada.`
        : serverMessage
    } else {
      historicalEnrollmentError.value = apiErrorMessage(cause, 'No se pudo agregar al alumno a la cursada histórica.')
    }
  } finally {
    savingHistoricalEnrollment.value = false
  }
}

async function loadStudentGrades(studentId: number | null): Promise<void> {
  const courseId = selectedCourseId.value
  const request = ++loadSequence.value
  grades.value = []
  error.value = ''
  success.value = ''
  if (!courseId || studentId === null || !students.value.some(student => student.alumnoId === studentId)) {
    loadingWorkspace.value = false
    return
  }

  loadingWorkspace.value = true
  try {
    const loadedGrades = await teacherCoursesApi.listGrades(courseId, { alumnoId: studentId })
    if (request !== loadSequence.value || selectedCourseId.value !== courseId || selectedStudentId.value !== studentId) return
    grades.value = loadedGrades.filter(grade => grade.alumno.alumnoId === studentId)
  } catch {
    if (request === loadSequence.value) error.value = 'No pudimos cargar las calificaciones de este alumno.'
  } finally {
    if (request === loadSequence.value) loadingWorkspace.value = false
  }
}

async function saveGrades(payload: SaveGradesPayload): Promise<void> {
  const course = selectedCourse.value
  const studentId = selectedStudentId.value
  if (!course || studentId === null || !students.value.some(student => student.alumnoId === studentId)
    || payload.cursadaId !== course.id || payload.calificaciones.some(grade => grade.alumnoId !== studentId)) return
  const request = loadSequence.value
  saving.value = true
  error.value = ''
  success.value = ''
  try {
    await teacherCoursesApi.saveGrades(payload)
    const refreshedGrades = await teacherCoursesApi.listGrades(course.id, { alumnoId: studentId })
    if (request !== loadSequence.value || selectedCourseId.value !== course.id || selectedStudentId.value !== studentId) return
    grades.value = refreshedGrades.filter(grade => grade.alumno.alumnoId === studentId)
    success.value = 'Las calificaciones se guardaron.'
  } catch {
    error.value = 'No se pudieron guardar las calificaciones. Revisá los datos e intentá de nuevo.'
  } finally {
    saving.value = false
  }
}

watch(selectedCourseId, value => {
  if (value) void loadWorkspace(value)
  else {
    loadSequence.value += 1
    loadingWorkspace.value = false
    students.value = []
    selectedStudentId.value = null
    grades.value = []
  }
})
onMounted(() => { void loadCourses() })
</script>

<template>
  <main class="mx-auto max-w-6xl" aria-labelledby="admin-course-grades-title">
    <p class="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--color-brand)]">Administración</p>
    <h1 id="admin-course-grades-title" class="mt-2 text-3xl font-semibold">Carga de calificaciones</h1>
    <p class="mt-2 max-w-3xl text-[var(--color-graphite)]">Elegí el ciclo lectivo para consultar sus cursadas y registrar notas históricas.</p>

    <form class="mt-6 grid max-w-2xl gap-3 rounded-xl border border-[var(--color-border)] bg-white p-4 sm:grid-cols-[minmax(12rem,1fr)_auto] sm:items-end" @submit.prevent="loadCourses">
      <label for="historical-grade-year" class="text-sm font-semibold">Año lectivo
        <input id="historical-grade-year" v-model="year" type="number" min="1" max="9999" step="1" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] px-3 font-normal" :disabled="saving" />
      </label>
      <button type="submit" class="min-h-11 rounded-md bg-[var(--color-brand)] px-4 py-2 font-semibold text-white" :disabled="loadingCourses || saving">{{ loadingCourses ? 'Buscando…' : 'Buscar cursadas' }}</button>
    </form>

    <p v-if="error" class="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{{ error }}</p>
    <p v-if="success" class="mt-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900" role="status">{{ success }}</p>

    <section class="mt-6 max-w-2xl" aria-labelledby="historical-course-title">
      <label id="historical-course-title" for="historical-course" class="text-sm font-semibold">Cursada</label>
      <select id="historical-course" v-model.number="selectedCourseId" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-3" :disabled="loadingCourses || loadingWorkspace || saving || !courses.length">
        <option :value="null">{{ loadingCourses ? 'Cargando…' : courses.length ? 'Seleccioná una cursada' : 'No hay cursadas para ese ciclo' }}</option>
        <option v-for="course in courses" :key="course.id" :value="course.id">{{ course.materia.nombre }} · {{ course.anioLectivo }} · {{ course.materia.carrera.nombre }}{{ course.espacioCurricular ? ` · Espacio: ${course.espacioCurricular.nombre}` : '' }}</option>
      </select>
    </section>

    <p v-if="historicalEnrollmentError" class="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{{ historicalEnrollmentError }}</p>
    <p v-if="historicalEnrollmentMessage" class="mt-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900" role="status">{{ historicalEnrollmentMessage }}</p>

    <section v-if="selectedCourse && (students.length || isHistoricalCourse)" class="mt-6 max-w-2xl" aria-labelledby="historical-enrollment-title">
      <form v-if="isHistoricalCourse" class="rounded-xl border border-[var(--color-border)] bg-white p-4" @submit.prevent="searchHistoricalStudents">
        <p id="historical-enrollment-title" class="font-semibold">Agregar alumno a la cursada histórica</p>
        <p class="mt-1 text-sm text-[var(--color-graphite)]">Buscá alumnos inscriptos en {{ selectedCourse.materia.carrera?.nombre ?? 'la carrera' }}, incluso si su inscripción a la carrera está inactiva.</p>
        <label for="historical-enrollment-search" class="mt-3 block text-sm font-semibold">Buscar por nombre o DNI
          <input id="historical-enrollment-search" v-model="historicalStudentSearch" type="search" autocomplete="off" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] px-3 font-normal" :disabled="savingHistoricalEnrollment" />
        </label>
        <button type="submit" class="mt-3 min-h-11 rounded-md border border-[var(--color-brand)] px-4 py-2 font-semibold text-[var(--color-brand)]" :disabled="loadingHistoricalStudents || savingHistoricalEnrollment">{{ loadingHistoricalStudents ? 'Buscando…' : 'Buscar alumnos' }}</button>
        <p v-if="loadingHistoricalStudents" class="mt-2 text-sm" role="status" aria-live="polite">Buscando alumnos…</p>
        <p v-else-if="historicalStudentSearch.trim().length >= 2 && historicalStudents.length && !availableHistoricalStudents.length" class="mt-2 text-sm" role="status">Los alumnos encontrados ya están en la nómina de esta cursada.</p>
        <p v-else-if="historicalStudentSearch.trim().length >= 2 && !loadingHistoricalStudents && !availableHistoricalStudents.length && !historicalEnrollmentError" class="mt-2 text-sm" role="status">No encontramos alumnos inscriptos en esta carrera con ese nombre o DNI.</p>
        <label v-if="availableHistoricalStudents.length" for="historical-enrollment-student" class="mt-3 block text-sm font-semibold">Alumno para agregar
          <select id="historical-enrollment-student" v-model.number="historicalStudentId" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-3 font-normal" :disabled="savingHistoricalEnrollment">
            <option :value="null">Seleccioná un alumno</option>
            <option v-for="student in availableHistoricalStudents" :key="student.idUsuario" :value="student.idUsuario">{{ student.apellidoNombre }} · DNI {{ student.dni }}{{ student.activo ? '' : ' · cuenta inactiva' }}</option>
          </select>
        </label>
        <button v-if="availableHistoricalStudents.length" type="button" class="mt-3 min-h-11 rounded-md bg-[var(--color-brand)] px-4 py-2 font-semibold text-white" :disabled="savingHistoricalEnrollment || historicalStudentId === null" @click="enrollHistoricalStudent">{{ savingHistoricalEnrollment ? 'Agregando…' : 'Agregar a la nómina' }}</button>
      </form>
    </section>

    <section v-if="selectedCourse && students.length" class="mt-6 max-w-2xl" aria-labelledby="historical-student-title">
      <label id="historical-student-title" for="historical-student" class="text-sm font-semibold">Alumno</label>
      <select id="historical-student" v-model.number="selectedStudentId" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-3" :disabled="saving" @change="loadStudentGrades(selectedStudentId)">
        <option :value="null">Seleccioná un alumno</option>
        <option v-for="student in students" :key="student.alumnoId" :value="student.alumnoId">{{ student.apellidoNombre }} · DNI {{ student.dni }}</option>
      </select>
    </section>

    <div v-if="loadingWorkspace" class="mt-6 rounded-xl border border-[var(--color-border)] bg-white p-8 text-center text-[var(--color-graphite)]" role="status" aria-busy="true">{{ selectedStudentId ? 'Cargando las calificaciones del alumno…' : 'Cargando alumnos…' }}</div>
    <GradesGrid v-else-if="selectedCourse && selectedStudent" class="mt-6" :course="selectedCourse" :students="[selectedStudent]" :grades="grades" :saving="saving" allow-historical @save="saveGrades" />
  </main>
</template>
