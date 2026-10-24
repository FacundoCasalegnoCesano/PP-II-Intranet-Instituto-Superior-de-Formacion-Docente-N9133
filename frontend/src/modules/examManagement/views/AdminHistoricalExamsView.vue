<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { apiClient } from '@/core/api/client'
import { apiErrorMessage } from '@/core/api/errors'
import { academicLabel } from '@/core/presentation/academicLabels'

interface HistoricalExam {
  via: 'EXAMEN_FINAL'
  id: number
  cursadaId: number | null
  alumnoId: number
  nombreAlumno: string
  carreraId: number
  nombreCarrera: string
  materiaId: number
  nombreMateria: string
  cicloLectivo: number
  fechaExamen: string
  notaFinal: number
  libro?: string | null
  folio?: string | null
  version: number
}

interface HistoricalPromotion {
  via: 'PROMOCIONADA'
  id: number
  alumnoId: number
  nombreAlumno: string
  carreraId: number
  nombreCarrera: string
  materiaId: number
  nombreMateria: string
  cursadaId: number
  cicloLectivo: number
  fechaExamen: string
  notaFinal: number
  libro?: null
  folio?: null
  version: number
  estado: 'VIGENTE' | 'CORREGIDA'
}

type HistoricalRecord = HistoricalExam | HistoricalPromotion
interface CourseOption { id: number; materiaId: number; materia: { id: number; nombre: string; notaMinima?: number | null }; anioLectivo: number; periodo: string }

interface StudentOption {
  idUsuario: number
  apellidoNombre: string
  dni: string | number
  activo: boolean
}

interface StudentCareer {
  carreraId: number
  activo: boolean
  carrera: { id: number; nombre: string; activo: boolean }
}

interface SubjectOption {
  id: number
  nombre: string
  activo: boolean
  carreraId?: number
  notaMinima?: number | null
}

type Picker = 'create' | 'filter'
const PAGE_SIZE = 100
const SEARCH_DEBOUNCE_MS = 300
const institutionalYear = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric' }).format(new Date()))

const records = ref<HistoricalRecord[]>([])
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const notice = ref('')
const catalogError = ref('')
const filters = reactive({ alumnoId: '', carreraId: '', materiaId: '', cicloLectivo: '', cursadaId: '' })
const createForm = reactive({ alumnoId: '', carreraId: '', materiaId: '', cicloLectivo: '', cursadaId: '', via: 'EXAMEN_FINAL' as 'EXAMEN_FINAL' | 'PROMOCIONADA', fechaExamen: '', notaFinal: '', libro: '', folio: '' })
const editing = ref<HistoricalRecord | null>(null)
const editForm = reactive({ notaFinal: '', fechaAcreditacion: '', libro: '', folio: '', motivo: '' })
const createCourses = ref<CourseOption[]>([])
const filterCourses = ref<CourseOption[]>([])
const loadingCourses = ref(false)
const loadingFilterCourses = ref(false)
let courseRequestId = 0
let filterCourseRequestId = 0

const historicalCourses = computed(() => createCourses.value.filter(course => course.anioLectivo < institutionalYear))
const availableYears = computed(() => [...new Set(historicalCourses.value.map(course => course.anioLectivo))].sort((a, b) => b - a))
const coursesForYear = computed(() => createCourses.value.filter(course => String(course.anioLectivo) === createForm.cicloLectivo))
const filterYears = computed(() => [...new Set(filterCourses.value.map(course => course.anioLectivo))].sort((a, b) => b - a))
const filterCoursesForYear = computed(() => filterCourses.value.filter(course => String(course.anioLectivo) === filters.cicloLectivo))

const studentSearch = reactive<Record<Picker, string>>({ create: '', filter: '' })
const students = reactive<Record<Picker, StudentOption[]>>({ create: [], filter: [] })
const careers = reactive<Record<Picker, StudentCareer[]>>({ create: [], filter: [] })
const subjects = reactive<Record<Picker, SubjectOption[]>>({ create: [], filter: [] })
const loadingStudents = reactive<Record<Picker, boolean>>({ create: false, filter: false })
const loadingCareers = reactive<Record<Picker, boolean>>({ create: false, filter: false })
const loadingSubjects = reactive<Record<Picker, boolean>>({ create: false, filter: false })
const searchRequestId: Record<Picker, number> = { create: 0, filter: 0 }
const careerRequestId: Record<Picker, number> = { create: 0, filter: 0 }
const subjectRequestId: Record<Picker, number> = { create: 0, filter: 0 }
const searchTimers: Record<Picker, ReturnType<typeof setTimeout> | null> = { create: null, filter: null }
let recordsRequestId = 0
let disposed = false

function queryString(values: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && String(value).trim()) query.set(key, String(value).trim())
  }
  const serialized = query.toString()
  return serialized ? `?${serialized}` : ''
}

async function loadAllPages<T>(path: (page: number) => string): Promise<T[]> {
  const first = await apiClient.getPaginated<T>(path(1))
  const { total, totalPages } = first.pagination
  if (first.pagination.page !== 1 || first.pagination.limit !== PAGE_SIZE
    || !Number.isInteger(total) || total < 0
    || !Number.isInteger(totalPages) || totalPages !== (total === 0 ? 0 : Math.ceil(total / PAGE_SIZE))) {
    throw new Error('La respuesta de paginación no es válida.')
  }
  const values = [...first.data]
  for (let page = 2; page <= totalPages; page += 1) {
    const next = await apiClient.getPaginated<T>(path(page))
    if (next.pagination.page !== page || next.pagination.limit !== PAGE_SIZE
      || next.pagination.total !== total || next.pagination.totalPages !== totalPages) {
      throw new Error('La respuesta de paginación no es válida.')
    }
    values.push(...next.data)
  }
  if (values.length !== total) throw new Error('La respuesta de paginación está incompleta.')
  return values
}

function studentLabel(student: StudentOption): string {
  return `${student.apellidoNombre} · DNI ${student.dni}${student.activo ? '' : ' · cuenta inactiva'}`
}

function careerLabel(enrollment: StudentCareer): string {
  const state = !enrollment.activo ? ' · inscripción histórica' : !enrollment.carrera.activo ? ' · carrera inactiva' : ''
  return `${enrollment.carrera.nombre}${state}`
}

function subjectLabel(subject: SubjectOption): string {
  return `${subject.nombre}${subject.activo ? '' : ' · materia archivada'}`
}

function selectedCareer(kind: Picker): number | null {
  const value = kind === 'create' ? createForm.carreraId : filters.carreraId
  return Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null
}

function selectedSubject(kind: Picker): SubjectOption | undefined {
  const value = kind === 'create' ? createForm.materiaId : filters.materiaId
  return subjects[kind].find(subject => String(subject.id) === value)
}

function invalidateRecords(): void {
  recordsRequestId += 1
  records.value = []
  editing.value = null
  loading.value = false
  error.value = ''
  notice.value = ''
}

async function loadRecords(): Promise<void> {
  const alumnoId = Number(filters.alumnoId)
  if (!Number.isInteger(alumnoId) || alumnoId < 1) {
    invalidateRecords()
    error.value = 'Elegí un alumno para consultar sus calificaciones históricas.'
    return
  }
  const requestId = ++recordsRequestId
  loading.value = true
  error.value = ''
  notice.value = ''
  try {
    const [exams, promotions] = await Promise.all([
      apiClient.get<Omit<HistoricalExam, 'via'>[]>(`/examenes/historicos${queryString(filters)}`),
      apiClient.get<{ items: Array<{ id: number; alumnoId: number; alumno: { apellidoNombre: string }; cursadaId: number; materia: { id: number; nombre: string }; carrera: { id: number; nombre: string }; cicloLectivo: number; notaFinal: number; fechaAcreditacion: string; version: number; estado: 'VIGENTE' | 'CORREGIDA'; via: 'PROMOCION_DIRECTA' }> }>(`/promociones-historicas${queryString(filters)}`),
    ])
    if (disposed || requestId !== recordsRequestId) return
    records.value = [
      ...exams.map(record => ({ ...record, via: 'EXAMEN_FINAL' as const })),
      ...promotions.items.map(record => ({
        via: 'PROMOCIONADA' as const, id: record.id, alumnoId: record.alumnoId,
        nombreAlumno: record.alumno.apellidoNombre, carreraId: record.carrera.id, nombreCarrera: record.carrera.nombre,
        materiaId: record.materia.id, nombreMateria: record.materia.nombre, cursadaId: record.cursadaId,
        cicloLectivo: record.cicloLectivo, fechaExamen: record.fechaAcreditacion, notaFinal: record.notaFinal,
        version: record.version, estado: record.estado,
      })),
    ].sort((a, b) => b.fechaExamen.localeCompare(a.fechaExamen) || a.nombreAlumno.localeCompare(b.nombreAlumno))
  } catch (caught) {
    if (!disposed && requestId === recordsRequestId) {
      records.value = []
      error.value = apiErrorMessage(caught, 'No pudimos cargar las calificaciones históricas.')
    }
  } finally {
    if (!disposed && requestId === recordsRequestId) loading.value = false
  }
}

function resetCareerCatalog(kind: Picker): void {
  careerRequestId[kind] += 1
  subjectRequestId[kind] += 1
  loadingCareers[kind] = false
  loadingSubjects[kind] = false
  careers[kind] = []
  subjects[kind] = []
  if (kind === 'create') {
    createForm.carreraId = ''
    createForm.materiaId = ''
    courseRequestId += 1
    createCourses.value = []
    createForm.cicloLectivo = ''
    createForm.cursadaId = ''
    loadingCourses.value = false
  } else {
    filters.carreraId = ''
    filters.materiaId = ''
    filterCourseRequestId += 1
    filterCourses.value = []
    filters.cicloLectivo = ''
    filters.cursadaId = ''
    loadingFilterCourses.value = false
  }
}

function resetSubjectCatalog(kind: Picker): void {
  subjectRequestId[kind] += 1
  loadingSubjects[kind] = false
  subjects[kind] = []
  if (kind === 'create') { createForm.materiaId = ''; createCourses.value = []; createForm.cicloLectivo = ''; createForm.cursadaId = '' }
  else { filters.materiaId = ''; filters.cicloLectivo = ''; filters.cursadaId = ''; filterCourses.value = []; filterCourseRequestId += 1; loadingFilterCourses.value = false }
}

async function searchStudents(kind: Picker, search: string, requestId: number): Promise<void> {
  loadingStudents[kind] = true
  catalogError.value = ''
  try {
    const found = await loadAllPages<StudentOption>(page => `/users${queryString({ rol: 'ALUMNO', search, page, limit: PAGE_SIZE })}`)
    if (disposed || requestId !== searchRequestId[kind] || studentSearch[kind].trim() !== search) return
    students[kind] = found
  } catch (caught) {
    if (!disposed && requestId === searchRequestId[kind]) {
      students[kind] = []
      catalogError.value = apiErrorMessage(caught, 'No pudimos buscar alumnos.')
    }
  } finally {
    if (!disposed && requestId === searchRequestId[kind]) loadingStudents[kind] = false
  }
}

function scheduleStudentSearch(kind: Picker): void {
  if (searchTimers[kind] !== null) clearTimeout(searchTimers[kind]!)
  const requestId = ++searchRequestId[kind]
  loadingStudents[kind] = false
  students[kind] = []
  if (kind === 'create') createForm.alumnoId = ''
  else filters.alumnoId = ''
  resetCareerCatalog(kind)
  invalidateRecords()
  catalogError.value = ''
  const search = studentSearch[kind].trim()
  if (search.length < 2) return
  loadingStudents[kind] = true
  searchTimers[kind] = setTimeout(() => {
    searchTimers[kind] = null
    void searchStudents(kind, search, requestId)
  }, SEARCH_DEBOUNCE_MS)
}

async function loadCareers(kind: Picker, usuarioId: number): Promise<void> {
  const requestId = ++careerRequestId[kind]
  loadingCareers[kind] = true
  catalogError.value = ''
  try {
    const result = await apiClient.get<StudentCareer[]>(`/inscripciones-carreras/alumno/${usuarioId}?includeInactive=true`)
    const selectedStudentId = kind === 'create' ? createForm.alumnoId : filters.alumnoId
    if (disposed || requestId !== careerRequestId[kind] || selectedStudentId !== String(usuarioId)) return
    careers[kind] = result
  } catch (caught) {
    if (!disposed && requestId === careerRequestId[kind]) {
      careers[kind] = []
      catalogError.value = apiErrorMessage(caught, 'No pudimos cargar las carreras del alumno.')
    }
  } finally {
    if (!disposed && requestId === careerRequestId[kind]) loadingCareers[kind] = false
  }
}

async function loadSubjects(kind: Picker, carreraId: number): Promise<void> {
  const requestId = ++subjectRequestId[kind]
  loadingSubjects[kind] = true
  catalogError.value = ''
  try {
    const result = await loadAllPages<SubjectOption>(page => `/materias${queryString({ carreraId, page, limit: PAGE_SIZE })}`)
    const selectedCareerId = selectedCareer(kind)
    if (disposed || requestId !== subjectRequestId[kind] || selectedCareerId !== carreraId) return
    subjects[kind] = result.filter(subject => subject.carreraId === carreraId)
  } catch (caught) {
    if (!disposed && requestId === subjectRequestId[kind]) {
      subjects[kind] = []
      catalogError.value = apiErrorMessage(caught, 'No pudimos cargar las materias de la carrera.')
    }
  } finally {
    if (!disposed && requestId === subjectRequestId[kind]) loadingSubjects[kind] = false
  }
}

async function loadCourses(materiaId: number): Promise<void> {
  const requestId = ++courseRequestId
  createCourses.value = []
  createForm.cicloLectivo = ''
  createForm.cursadaId = ''
  loadingCourses.value = true
  try {
    const result = await loadAllPages<CourseOption>(page => `/cursadas${queryString({ materiaId, page, limit: PAGE_SIZE })}`)
    if (disposed || requestId !== courseRequestId || Number(createForm.materiaId) !== materiaId) return
    createCourses.value = result.filter(course => (course.materiaId === materiaId || course.materia.id === materiaId) && course.anioLectivo < institutionalYear)
  } catch (caught) {
    if (!disposed && requestId === courseRequestId) catalogError.value = apiErrorMessage(caught, 'No pudimos cargar las cursadas de la materia.')
  } finally {
    if (!disposed && requestId === courseRequestId) loadingCourses.value = false
  }
}

function onStudentChange(kind: Picker): void {
  resetCareerCatalog(kind)
  invalidateRecords()
  catalogError.value = ''
  const value = kind === 'create' ? createForm.alumnoId : filters.alumnoId
  const usuarioId = Number(value)
  if (Number.isInteger(usuarioId) && usuarioId > 0) void loadCareers(kind, usuarioId)
}

function onCareerChange(kind: Picker): void {
  resetSubjectCatalog(kind)
  invalidateRecords()
  catalogError.value = ''
  const carreraId = selectedCareer(kind)
  if (carreraId) void loadSubjects(kind, carreraId)
}

function onSubjectChange(kind: Picker = 'create'): void {
  invalidateRecords()
  if (kind === 'filter') {
    const materiaId = Number(filters.materiaId)
    filterCourses.value = []; filters.cicloLectivo = ''; filters.cursadaId = ''
    if (Number.isInteger(materiaId) && materiaId > 0) void loadFilterCourses(materiaId)
    return
  }
  createForm.cursadaId = ''
  createForm.cicloLectivo = ''
  createCourses.value = []
  const materiaId = Number(createForm.materiaId)
  if (Number.isInteger(materiaId) && materiaId > 0) void loadCourses(materiaId)
}

function onCreateYearChange(): void { createForm.cursadaId = '' }

async function loadFilterCourses(materiaId: number): Promise<void> {
  const requestId = ++filterCourseRequestId
  loadingFilterCourses.value = true
  try {
    const result = await loadAllPages<CourseOption>(page => `/cursadas${queryString({ materiaId, page, limit: PAGE_SIZE })}`)
    if (!disposed && requestId === filterCourseRequestId && Number(filters.materiaId) === materiaId) filterCourses.value = result.filter(course => course.materiaId === materiaId || course.materia.id === materiaId)
  } catch (caught) {
    if (!disposed && requestId === filterCourseRequestId) catalogError.value = apiErrorMessage(caught, 'No pudimos cargar las cursadas de la materia.')
  } finally { if (!disposed && requestId === filterCourseRequestId) loadingFilterCourses.value = false }
}

function validCreate(): { alumnoId: number; materiaId: number; cursadaId: number; cicloLectivo: number; fechaExamen: string; notaFinal: number; libro?: string; folio?: string } | null {
  const alumnoId = Number(createForm.alumnoId)
  const materiaId = Number(createForm.materiaId)
  const cursadaId = Number(createForm.cursadaId)
  const carreraId = selectedCareer('create')
  const cicloLectivo = Number(createForm.cicloLectivo)
  const notaFinal = Number(createForm.notaFinal)
  const career = careers.create.find(item => item.carreraId === carreraId)
  const subject = selectedSubject('create')
  const course = createCourses.value.find(item => item.id === cursadaId)
  const date = createForm.fechaExamen
  const passing = createForm.via === 'PROMOCIONADA'
  const minimum = subject?.notaMinima ?? course?.materia.notaMinima ?? 6
  if (!Number.isInteger(alumnoId) || alumnoId < 1 || !career || !subject || subject.carreraId !== career.carreraId
    || !course || course.materiaId !== materiaId || course.anioLectivo !== cicloLectivo) {
    error.value = 'Elegí un alumno, carrera, materia y cursada que correspondan entre sí.'
    return null
  }
  if (!date) { error.value = passing ? 'Ingresá la fecha de acreditación.' : 'Ingresá la fecha real del examen.'; return null }
  if (!String(createForm.notaFinal).trim() || !Number.isInteger(notaFinal) || notaFinal < (passing ? minimum : 0) || notaFinal > 10) {
    error.value = passing
      ? `La promoción requiere una nota aprobatoria de ${minimum} o más.`
      : 'La nota del examen debe ser un número entero entre 0 y 10.'
    return null
  }
  return {
    alumnoId,
    materiaId,
    cursadaId,
    cicloLectivo,
    fechaExamen: date,
    notaFinal,
    ...(createForm.libro.trim() ? { libro: createForm.libro.trim() } : {}),
    ...(createForm.folio.trim() ? { folio: createForm.folio.trim() } : {}),
  }
}

async function createRecord(): Promise<void> {
  const payload = validCreate()
  if (!payload) return
  const studentId = payload.alumnoId
  const studentQuery = studentSearch.create
  const selectedStudents = [...students.create]
  const selectedCareers = [...careers.create]
  const selectedSubjects = [...subjects.create]
  const savedVia = createForm.via
  saving.value = true
  error.value = ''
  notice.value = ''
  try {
    if (createForm.via === 'PROMOCIONADA') {
      await apiClient.post('/promociones-historicas', { cursadaId: payload.cursadaId, alumnoId: payload.alumnoId, notaFinal: payload.notaFinal, fechaAcreditacion: payload.fechaExamen })
    } else {
      await apiClient.post('/examenes/historicos', payload)
    }
    Object.assign(createForm, { alumnoId: '', carreraId: '', materiaId: '', cicloLectivo: '', cursadaId: '', fechaExamen: '', notaFinal: '', libro: '', folio: '' })
    createCourses.value = []
    studentSearch.create = ''
    students.create = []
    resetCareerCatalog('create')
    Object.assign(filters, { alumnoId: String(studentId), carreraId: '', materiaId: '', cicloLectivo: '', cursadaId: '' })
    studentSearch.filter = studentQuery
    students.filter = selectedStudents
    careers.filter = selectedCareers
    subjects.filter = selectedSubjects
    await loadRecords()
    notice.value = `La calificación histórica ${savedVia === 'PROMOCIONADA' ? 'promocionada' : 'de examen final'} se registró. Se muestra el historial de ese alumno.`
  } catch (caught) {
    error.value = apiErrorMessage(caught, 'No se pudo guardar la calificación histórica. Revisá los datos ingresados.')
  } finally {
    saving.value = false
  }
}

function beginEdit(record: HistoricalRecord): void {
  editing.value = record
  Object.assign(editForm, { notaFinal: String(record.notaFinal), fechaAcreditacion: record.via === 'PROMOCIONADA' ? record.fechaExamen : '', libro: record.libro ?? '', folio: record.folio ?? '', motivo: '' })
  error.value = ''
}

async function saveEdit(): Promise<void> {
  const record = editing.value
  if (!String(editForm.notaFinal).trim()) { error.value = 'Ingresá una nota entre 0 y 10.'; return }
  const notaFinal = Number(editForm.notaFinal)
  if (!record) return
  if (!Number.isInteger(notaFinal) || notaFinal < 0 || notaFinal > 10 || !editForm.motivo.trim()) {
    error.value = 'Indicá una nota entera entre 0 y 10 y el motivo del cambio.'
    return
  }
  saving.value = true
  error.value = ''
  notice.value = ''
  try {
    if (record.via === 'PROMOCIONADA') {
      await apiClient.request(`/promociones-historicas/${record.id}`, { method: 'PATCH', body: { notaFinal, fechaAcreditacion: editForm.fechaAcreditacion || undefined, motivo: editForm.motivo.trim(), expectedVersion: record.version } })
    } else {
      await apiClient.request<HistoricalExam>(`/examenes/historicos/${record.id}`, {
        method: 'PATCH',
        body: { notaFinal, libro: editForm.libro.trim() || null, folio: editForm.folio.trim() || null, motivo: editForm.motivo.trim(), expectedVersion: record.version },
      })
    }
    editing.value = null
    await loadRecords()
    notice.value = 'El registro histórico se actualizó.'
  } catch (caught) {
    const message = apiErrorMessage(caught, 'No se pudo actualizar la calificación histórica.')
    error.value = /versi[oó]n/i.test(message)
      ? 'El registro cambió desde la última consulta. Volvé a buscarlo antes de corregirlo.'
      : message
  } finally {
    saving.value = false
  }
}

onBeforeUnmount(() => {
  disposed = true
  recordsRequestId += 1
  for (const kind of ['create', 'filter'] as const) {
    searchRequestId[kind] += 1
    careerRequestId[kind] += 1
    subjectRequestId[kind] += 1
    if (searchTimers[kind] !== null) clearTimeout(searchTimers[kind]!)
  }
})
</script>

<template>
  <main class="mx-auto max-w-6xl" aria-labelledby="admin-historical-exams-title">
    <p class="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--color-brand)]">Administración</p>
    <h1 id="admin-historical-exams-title" class="mt-2 text-3xl font-semibold">Calificaciones históricas</h1>
    <p class="mt-2 max-w-3xl text-[var(--color-graphite)]">Consultá y cargá calificaciones de cursadas anteriores. Las correcciones requieren un motivo.</p>

    <section class="mt-6 rounded-xl border border-[var(--color-border)] bg-white p-4 sm:p-5" aria-labelledby="historic-create-title">
      <h2 id="historic-create-title" class="text-xl font-semibold">Cargar calificación histórica</h2>
      <p id="historic-create-help" class="mt-2 text-sm text-[var(--color-graphite)]">Buscá al alumno por nombre, DNI o correo. Después elegí carrera, materia y una cursada existente.</p>
      <form class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" :aria-busy="saving" @submit.prevent="createRecord">
        <fieldset class="contents" :disabled="saving">
        <label for="historic-create-student-search" class="text-sm font-semibold">Buscar alumno<input id="historic-create-student-search" v-model="studentSearch.create" type="search" autocomplete="off" placeholder="Nombre, DNI o correo" class="historic-input" aria-describedby="historic-create-help" @input="scheduleStudentSearch('create')" /></label>
        <label for="historic-create-student" class="text-sm font-semibold">Alumno<select id="historic-create-student" v-model="createForm.alumnoId" class="historic-input" :disabled="loadingStudents.create" :aria-busy="loadingStudents.create" @change="onStudentChange('create')"><option value="">{{ loadingStudents.create ? 'Buscando alumnos…' : studentSearch.create.trim().length < 2 ? 'Buscá por nombre o DNI' : students.create.length ? 'Seleccioná un alumno' : 'No se encontraron alumnos' }}</option><option v-for="student in students.create" :key="student.idUsuario" :value="String(student.idUsuario)">{{ studentLabel(student) }}</option></select></label>
        <label for="historic-create-career" class="text-sm font-semibold">Carrera<select id="historic-create-career" v-model="createForm.carreraId" class="historic-input" :disabled="!createForm.alumnoId || loadingCareers.create" :aria-busy="loadingCareers.create" @change="onCareerChange('create')"><option value="">{{ loadingCareers.create ? 'Cargando carreras…' : !createForm.alumnoId ? 'Elegí primero un alumno' : careers.create.length ? 'Seleccioná una carrera' : 'El alumno no tiene carreras registradas' }}</option><option v-for="career in careers.create" :key="career.carreraId" :value="String(career.carreraId)">{{ careerLabel(career) }}</option></select></label>
        <label for="historic-create-subject" class="text-sm font-semibold">Materia<select id="historic-create-subject" v-model="createForm.materiaId" class="historic-input" :disabled="!createForm.carreraId || loadingSubjects.create" :aria-busy="loadingSubjects.create" @change="onSubjectChange('create')"><option value="">{{ loadingSubjects.create ? 'Cargando materias…' : !createForm.carreraId ? 'Elegí primero una carrera' : subjects.create.length ? 'Seleccioná una materia' : 'No hay materias para esa carrera' }}</option><option v-for="subject in subjects.create" :key="subject.id" :value="String(subject.id)">{{ subjectLabel(subject) }}</option></select></label>
        <label for="historic-create-via" class="text-sm font-semibold">Vía de aprobación<select id="historic-create-via" v-model="createForm.via" class="historic-input"><option value="PROMOCIONADA">Promocionada</option><option value="EXAMEN_FINAL">Examen final</option></select></label>
        <label for="historic-create-cycle" class="text-sm font-semibold">Ciclo lectivo<select id="historic-create-cycle" v-model="createForm.cicloLectivo" class="historic-input" :disabled="loadingCourses || !historicalCourses.length" @change="onCreateYearChange"><option value="">{{ loadingCourses ? 'Cargando cursadas…' : !createForm.materiaId ? 'Elegí primero una materia' : historicalCourses.length ? 'Seleccioná un ciclo anterior' : 'No hay cursadas históricas' }}</option><option v-for="year in availableYears" :key="year" :value="String(year)">{{ year }}</option></select></label>
        <label for="historic-create-course" class="text-sm font-semibold">Cursada existente<select id="historic-create-course" v-model="createForm.cursadaId" class="historic-input" :disabled="!createForm.cicloLectivo"><option value="">{{ !createForm.cicloLectivo ? 'Elegí primero un ciclo' : coursesForYear.length ? 'Seleccioná una cursada' : 'No hay cursadas para este ciclo' }}</option><option v-for="course in coursesForYear" :key="course.id" :value="String(course.id)">{{ course.anioLectivo }} · {{ academicLabel(course.periodo) }}</option></select></label>
        <p v-if="createForm.materiaId && !loadingCourses && !historicalCourses.length" class="rounded-lg bg-[#f6f7f4] p-3 text-sm text-[var(--color-graphite)] sm:col-span-2 lg:col-span-4">No hay una cursada de un ciclo anterior para esta materia. Creá la cursada de ese año para cargar la calificación. <RouterLink :to="{ name: 'admin-courses' }" class="font-semibold text-[var(--color-brand)]">Ir a gestión de cursadas</RouterLink></p>
        <label class="text-sm font-semibold">Fecha {{ createForm.via === 'PROMOCIONADA' ? 'de acreditación' : 'del examen' }}<input v-model="createForm.fechaExamen" type="date" required class="historic-input" /></label>
        <label for="historic-create-grade" class="text-sm font-semibold">{{ createForm.via === 'PROMOCIONADA' ? 'Nota de aprobación' : 'Nota final' }}<input id="historic-create-grade" v-model="createForm.notaFinal" type="number" min="0" max="10" step="1" required class="historic-input" /></label>
        <template v-if="createForm.via === 'EXAMEN_FINAL'"><label class="text-sm font-semibold">Libro <span class="font-normal text-[var(--color-graphite)]">(opcional)</span><input v-model="createForm.libro" maxlength="100" class="historic-input" /></label>
        <label class="text-sm font-semibold">Folio <span class="font-normal text-[var(--color-graphite)]">(opcional)</span><input v-model="createForm.folio" maxlength="100" class="historic-input" /></label></template>
        <button type="submit" class="min-h-11 self-end rounded-md bg-[var(--color-brand)] px-4 py-2 font-semibold text-white disabled:opacity-50" :disabled="saving || loadingStudents.create || loadingCareers.create || loadingSubjects.create || loadingCourses">{{ saving ? 'Guardando…' : 'Guardar calificación' }}</button>
        </fieldset>
      </form>
    </section>

    <section class="mt-7" aria-labelledby="historic-search-title">
      <h2 id="historic-search-title" class="text-xl font-semibold">Buscar registros</h2>
      <p id="historic-filter-help" class="mt-1 text-sm text-[var(--color-graphite)]">Los filtros de carrera y materia se limitan a la trayectoria del alumno seleccionado.</p>
      <form class="mt-3 grid gap-3 rounded-xl border border-[var(--color-border)] bg-white p-4 sm:grid-cols-2 lg:grid-cols-5" @submit.prevent="loadRecords">
        <label for="historic-filter-student-search" class="text-sm font-semibold">Buscar alumno<input id="historic-filter-student-search" v-model="studentSearch.filter" type="search" autocomplete="off" placeholder="Nombre, DNI o correo" class="historic-input" aria-describedby="historic-filter-help" @input="scheduleStudentSearch('filter')" /></label>
        <label for="historic-filter-student" class="text-sm font-semibold">Alumno<select id="historic-filter-student" v-model="filters.alumnoId" class="historic-input" :disabled="loadingStudents.filter" :aria-busy="loadingStudents.filter" @change="onStudentChange('filter')"><option value="">{{ loadingStudents.filter ? 'Buscando alumnos…' : studentSearch.filter.trim().length < 2 ? 'Seleccioná un alumno' : students.filter.length ? 'Seleccioná un alumno' : 'No se encontraron alumnos' }}</option><option v-for="student in students.filter" :key="student.idUsuario" :value="String(student.idUsuario)">{{ studentLabel(student) }}</option></select></label>
        <label for="historic-filter-career" class="text-sm font-semibold">Carrera<select id="historic-filter-career" v-model="filters.carreraId" class="historic-input" :disabled="!filters.alumnoId || loadingCareers.filter" :aria-busy="loadingCareers.filter" aria-describedby="historic-filter-help" @change="onCareerChange('filter')"><option value="">{{ loadingCareers.filter ? 'Cargando carreras…' : !filters.alumnoId ? 'Elegí primero un alumno' : 'Todas las carreras del alumno' }}</option><option v-for="career in careers.filter" :key="career.carreraId" :value="String(career.carreraId)">{{ careerLabel(career) }}</option></select></label>
        <label for="historic-filter-subject" class="text-sm font-semibold">Materia<select id="historic-filter-subject" v-model="filters.materiaId" class="historic-input" :disabled="!filters.carreraId || loadingSubjects.filter" :aria-busy="loadingSubjects.filter" @change="onSubjectChange('filter')"><option value="">{{ loadingSubjects.filter ? 'Cargando materias…' : !filters.carreraId ? 'Elegí primero una carrera' : 'Todas las materias de la carrera' }}</option><option v-for="subject in subjects.filter" :key="subject.id" :value="String(subject.id)">{{ subjectLabel(subject) }}</option></select></label>
        <label for="historic-filter-cycle" class="text-sm font-semibold">Ciclo lectivo<select id="historic-filter-cycle" v-model="filters.cicloLectivo" class="historic-input" :disabled="loadingFilterCourses" @change="filters.cursadaId = ''; invalidateRecords()"><option value="">Todos</option><option v-for="year in filterYears" :key="year" :value="String(year)">{{ year }}</option></select></label>
        <label for="historic-filter-course" class="text-sm font-semibold">Cursada<select id="historic-filter-course" v-model="filters.cursadaId" class="historic-input" :disabled="!filters.cicloLectivo"><option value="">Todas las cursadas</option><option v-for="course in filterCoursesForYear" :key="course.id" :value="String(course.id)">{{ course.anioLectivo }} · {{ academicLabel(course.periodo) }}</option></select></label>
        <button type="submit" class="min-h-11 self-end rounded-md border border-[var(--color-border)] px-4 py-2 font-semibold disabled:opacity-50" :disabled="loading || !filters.alumnoId">{{ loading ? 'Buscando…' : 'Buscar' }}</button>
      </form>
    </section>

    <p v-if="catalogError" class="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{{ catalogError }}</p>
    <p v-if="error" class="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{{ error }}</p>
    <p v-if="notice" class="mt-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900" role="status">{{ notice }}</p>

    <section class="mt-4 overflow-hidden rounded-xl border border-[var(--color-border)] bg-white" aria-label="Registros de mesas históricas">
      <div v-if="loading" class="p-8 text-center text-[var(--color-graphite)]" role="status" aria-busy="true">Cargando calificaciones…</div>
      <p v-else-if="!records.length" class="p-8 text-center text-[var(--color-graphite)]" role="status">{{ filters.alumnoId ? 'No hay calificaciones históricas para este alumno.' : 'Buscá un alumno para consultar sus calificaciones históricas.' }}</p>
      <div v-else class="min-w-0 max-w-full">
        <ul data-testid="historical-record-cards" class="min-w-0 space-y-3 p-3 sm:p-4 xl:hidden" aria-label="Calificaciones históricas">
          <li v-for="record in records" :key="`${record.via}-${record.id}`" class="min-w-0 max-w-full rounded-lg border border-[var(--color-border)] p-4">
            <div class="flex min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div class="min-w-0 break-words [overflow-wrap:anywhere]">
                <p class="font-semibold">{{ record.nombreAlumno }}</p>
                <p class="mt-1">{{ record.nombreCarrera }}</p>
                <p class="text-sm text-[var(--color-graphite)]">{{ record.nombreMateria }}</p>
              </div>
              <p class="min-w-0 break-words text-sm sm:text-right">{{ record.via === 'PROMOCIONADA' ? 'Promocionada' : 'Examen final' }}<span v-if="record.via === 'PROMOCIONADA' && record.estado === 'CORREGIDA'" class="block text-[var(--color-graphite)]">Corregida</span></p>
            </div>
            <dl class="mt-3 grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div class="min-w-0"><dt class="text-[var(--color-graphite)]">Ciclo lectivo</dt><dd class="break-words">{{ record.cicloLectivo }}</dd></div>
              <div class="min-w-0"><dt class="text-[var(--color-graphite)]">Fecha</dt><dd class="break-words">{{ record.fechaExamen }}</dd></div>
              <div class="min-w-0"><dt class="text-[var(--color-graphite)]">Nota</dt><dd class="font-semibold">{{ record.notaFinal }}</dd></div>
              <div class="min-w-0"><dt class="text-[var(--color-graphite)]">Acta</dt><dd class="break-words">{{ record.libro || '—' }} · Folio {{ record.folio || '—' }}</dd></div>
            </dl>
            <button type="button" class="mt-4 min-h-11 w-full rounded-md border border-[var(--color-border)] px-3 font-semibold text-[var(--color-brand)] sm:w-auto" :aria-label="`Corregir calificación de ${record.nombreAlumno} · ${record.nombreMateria}`" @click="beginEdit(record)">Corregir</button>
          </li>
        </ul>
        <div class="historic-table-scroll hidden min-w-0 max-w-full overflow-x-auto xl:block" tabindex="0" role="region" aria-label="Tabla de calificaciones históricas">
        <table class="w-full min-w-[760px] text-left text-sm">
          <thead class="bg-[#f6f7f4]"><tr><th class="px-4 py-3">Alumno</th><th class="px-4 py-3">Carrera / materia</th><th class="px-4 py-3">Vía</th><th class="px-4 py-3">Ciclo y fecha</th><th class="px-4 py-3">Nota</th><th class="px-4 py-3">Acta</th><th class="px-4 py-3"><span class="sr-only">Acciones</span></th></tr></thead>
          <tbody><tr v-for="record in records" :key="`${record.via}-${record.id}`" class="border-t border-[var(--color-border)]"><td class="px-4 py-3"><strong>{{ record.nombreAlumno }}</strong></td><td class="px-4 py-3">{{ record.nombreCarrera }}<small class="block text-[var(--color-graphite)]">{{ record.nombreMateria }}</small></td><td class="px-4 py-3">{{ record.via === 'PROMOCIONADA' ? 'Promocionada' : 'Examen final' }}<small v-if="record.via === 'PROMOCIONADA' && record.estado === 'CORREGIDA'" class="block text-[var(--color-graphite)]">Corregida</small></td><td class="px-4 py-3">{{ record.cicloLectivo }}<small class="block text-[var(--color-graphite)]">{{ record.fechaExamen }}</small></td><td class="px-4 py-3 font-semibold">{{ record.notaFinal }}</td><td class="px-4 py-3">{{ record.libro || '—' }}<small class="block text-[var(--color-graphite)]">Folio {{ record.folio || '—' }}</small></td><td class="px-4 py-3 text-right"><button type="button" class="min-h-10 rounded-md border border-[var(--color-border)] px-3 font-semibold text-[var(--color-brand)]" @click="beginEdit(record)">Corregir</button></td></tr></tbody>
        </table>
        </div>
      </div>
    </section>

    <section v-if="editing" class="mt-6 rounded-xl border border-[var(--color-border)] bg-white p-5" aria-labelledby="historic-edit-title">
      <h2 id="historic-edit-title" class="text-xl font-semibold">Corregir calificación: {{ editing.nombreAlumno }} · {{ editing.nombreMateria }}</h2>
      <form class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" :aria-busy="saving" @submit.prevent="saveEdit">
        <fieldset class="contents" :disabled="saving">
        <label class="text-sm font-semibold">Nota final<input v-model="editForm.notaFinal" type="number" min="0" max="10" step="1" class="historic-input" /></label>
        <label v-if="editing.via === 'PROMOCIONADA'" class="text-sm font-semibold">Fecha de acreditación<input v-model="editForm.fechaAcreditacion" type="date" class="historic-input" /></label>
        <template v-else><label class="text-sm font-semibold">Libro<input v-model="editForm.libro" maxlength="100" class="historic-input" /></label>
        <label class="text-sm font-semibold">Folio<input v-model="editForm.folio" maxlength="100" class="historic-input" /></label></template>
        <label class="text-sm font-semibold sm:col-span-2 lg:col-span-4">Motivo de la corrección<textarea v-model="editForm.motivo" rows="3" maxlength="1000" required class="mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 font-normal" /></label>
        <div class="flex flex-wrap gap-3 sm:col-span-2 lg:col-span-4"><button type="submit" class="min-h-11 rounded-md bg-[var(--color-brand)] px-4 py-2 font-semibold text-white" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar corrección' }}</button><button type="button" class="min-h-11 rounded-md border border-[var(--color-border)] px-4 py-2 font-semibold" @click="editing = null">Cancelar</button></div>
        </fieldset>
      </form>
    </section>
  </main>
</template>

<style scoped>
.historic-input { margin-top: .25rem; min-height: 2.75rem; width: 100%; min-width: 0; border: 1px solid var(--color-border); border-radius: .375rem; padding: 0 .75rem; font-weight: 400; }
.historic-table-scroll:focus-visible { outline-offset: -3px; }
</style>
