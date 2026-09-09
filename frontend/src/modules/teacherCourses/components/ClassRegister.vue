<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { teacherCoursesApi } from '../api/teacherCoursesApi'
import type { ClassRecord, ClassSummary, EnrolledStudent, TeacherCourse } from '../types/teacherCourses'

const props = withDefaults(defineProps<{
  course: TeacherCourse
  students: EnrolledStudent[]
  classes: ClassSummary[]
}>(), {
  students: () => [],
  classes: () => [],
})

type DraftAttendance = EnrolledStudent & {
  presente: boolean
  justificado: boolean
  observacion: string
}

const currentYear = Number(new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric',
}).format(new Date()))

const history = ref<ClassSummary[]>([])
const selectedDate = ref('')
const topic = ref('')
const rows = ref<DraftAttendance[]>([])
const loadingDetail = ref(false)
const saving = ref(false)
const error = ref('')
const validationError = ref('')
const successMessage = ref('')
const staleResponsesDiscarded = ref(0)
let detailRequest = 0
let refreshRequest = 0

const editable = computed(() => (
  (props.course.editable ?? (props.course.activo && props.course.anioLectivo === currentYear))
  && props.course.anioLectivo === currentYear
))

function blankRows(): DraftAttendance[] {
  return props.students.map(student => ({
    ...student,
    presente: true,
    justificado: false,
    observacion: '',
  }))
}

function resetDraft(date = ''): void {
  selectedDate.value = date
  topic.value = ''
  rows.value = editable.value ? blankRows() : []
  loadingDetail.value = false
  validationError.value = ''
  error.value = ''
  successMessage.value = ''
}

function applyRecord(record: ClassRecord): void {
  topic.value = record.temaDesarrollado
  if (!editable.value) {
    rows.value = record.asistencias.map(attendance => ({
      alumnoId: attendance.alumnoId,
      apellidoNombre: attendance.nombre,
      dni: attendance.dni,
      email: '',
      presente: attendance.presente,
      justificado: attendance.presente ? false : Boolean(attendance.justificado),
      observacion: attendance.observacion ?? '',
    }))
    return
  }
  const attendanceByStudent = new Map(record.asistencias.map(attendance => [attendance.alumnoId, attendance]))
  rows.value = props.students.map(student => {
    const attendance = attendanceByStudent.get(student.alumnoId)
    const presente = attendance?.presente ?? true
    return {
      ...student,
      presente,
      justificado: presente ? false : Boolean(attendance?.justificado),
      observacion: attendance?.observacion ?? '',
    }
  })
}

function formatCount(value: number, singular: string, plural: string): string {
  return `${value} ${value === 1 ? singular : plural}`
}

function historySummary(item: ClassSummary): string {
  return [
    formatCount(item.presentes, 'presente', 'presentes'),
    formatCount(item.ausentes, 'ausente', 'ausentes'),
    formatCount(item.ausentesJustificados, 'ausencia justificada', 'ausencias justificadas'),
  ].join(' · ')
}

function startNewClass(): void {
  if (saving.value) return
  detailRequest += 1
  resetDraft()
}

async function openDate(date: string): Promise<void> {
  if (saving.value) return
  detailRequest += 1
  const request = detailRequest
  selectedDate.value = date
  validationError.value = ''
  error.value = ''
  successMessage.value = ''
  const summary = history.value.find(item => item.fecha === date)
  resetDraft(date)
  if (!summary) return

  topic.value = summary.temaDesarrollado
  loadingDetail.value = true
  try {
    const record = await teacherCoursesApi.getClass(props.course.id, date)
    if (request !== detailRequest) {
      staleResponsesDiscarded.value += 1
      return
    }
    if (record) applyRecord(record)
  } catch {
    if (request !== detailRequest) {
      staleResponsesDiscarded.value += 1
      return
    }
    error.value = 'No pudimos cargar el detalle de la clase.'
  } finally {
    if (request === detailRequest) loadingDetail.value = false
  }
}

function updatePresence(row: DraftAttendance, presente: boolean): void {
  row.presente = presente
  if (presente) row.justificado = false
}

function payloadForCurrentDraft() {
  return {
    temaDesarrollado: topic.value.trim(),
    asistencias: props.students.map(student => {
      const row = rows.value.find(candidate => candidate.alumnoId === student.alumnoId)
      const presente = row?.presente ?? true
      return {
        alumnoId: student.alumnoId,
        presente,
        justificado: presente ? false : Boolean(row?.justificado),
        observacion: row?.observacion.trim() || null,
      }
    }),
  }
}

function validateDraft(): boolean {
  const missing: string[] = []
  if (!selectedDate.value) missing.push('la fecha')
  if (!topic.value.trim()) missing.push('el tema desarrollado')
  if (missing.length) {
    validationError.value = `Completá ${missing.join(' y ')} para guardar la clase.`
    return false
  }
  validationError.value = ''
  return true
}

async function refreshAfterSave(date: string, request: number): Promise<void> {
  const nextHistory = await teacherCoursesApi.listClasses(props.course.id)
  if (request !== refreshRequest || date !== selectedDate.value) {
    staleResponsesDiscarded.value += 1
    return
  }
  history.value = nextHistory
  const record = await teacherCoursesApi.getClass(props.course.id, date)
  if (request !== refreshRequest || date !== selectedDate.value) {
    staleResponsesDiscarded.value += 1
    return
  }
  if (record) applyRecord(record)
}

async function save(): Promise<void> {
  if (!editable.value || !props.students.length || !validateDraft()) return
  const date = selectedDate.value
  const payload = payloadForCurrentDraft()
  saving.value = true
  error.value = ''
  successMessage.value = ''
  try {
    await teacherCoursesApi.saveClass(props.course.id, date, payload)
  } catch {
    error.value = 'No pudimos guardar la clase. Revisá los datos e intentá nuevamente.'
    saving.value = false
    return
  }

  const request = ++refreshRequest
  try {
    await refreshAfterSave(date, request)
    if (request === refreshRequest && date === selectedDate.value) successMessage.value = 'Clase guardada.'
  } catch {
    if (request === refreshRequest) error.value = 'La clase se guardó, pero no pudimos actualizar su detalle. Intentá nuevamente.'
  } finally {
    saving.value = false
  }
}

watch(() => [props.course.id, props.students] as const, () => {
  detailRequest += 1
  refreshRequest += 1
  history.value = [...props.classes]
  resetDraft()
  loadingDetail.value = false
}, { immediate: true })

watch(() => props.classes, value => {
  history.value = [...value]
}, { deep: true })
</script>

<template>
  <section aria-labelledby="class-register-title" class="mt-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h3 id="class-register-title" class="text-xl font-semibold">Clases</h3>
        <p class="mt-1 text-sm text-[var(--color-graphite)]">Consultá el historial y registrá el tema desarrollado junto con la asistencia completa.</p>
      </div>
      <p v-if="!editable" class="font-semibold text-[var(--color-graphite)]">Solo lectura: cursada histórica</p>
    </div>

    <p v-if="staleResponsesDiscarded" class="mt-3 text-sm text-[var(--color-graphite)]" role="status" aria-live="polite">Solicitudes obsoletas descartadas: {{ staleResponsesDiscarded }}</p>

    <section class="mt-5 rounded-lg border border-[var(--color-border)] bg-white p-4" aria-labelledby="class-history-title">
      <h4 id="class-history-title" class="font-semibold">Historial de clases</h4>
      <p v-if="!history.length" class="mt-3 text-sm text-[var(--color-graphite)]" role="status">Todavía no hay clases registradas.</p>
      <div v-else class="mt-3 overflow-x-auto">
        <table class="w-full min-w-[34rem] border-collapse text-left text-sm">
          <caption class="sr-only">Historial de clases de la cursada</caption>
          <thead>
            <tr class="border-b border-[var(--color-border)] text-[var(--color-graphite)]">
              <th scope="col" class="px-3 py-2 font-semibold">Fecha</th>
              <th scope="col" class="px-3 py-2 font-semibold">Tema</th>
              <th scope="col" class="px-3 py-2 font-semibold">Asistencia</th>
              <th scope="col" class="px-3 py-2 text-right font-semibold"><span class="sr-only">Acción</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in history" :key="item.fecha" class="border-b border-[var(--color-border)]">
              <th scope="row" class="px-3 py-3 font-semibold">{{ item.fecha }}</th>
              <td class="px-3 py-3">{{ item.temaDesarrollado }}</td>
              <td class="px-3 py-3 text-[var(--color-graphite)]">{{ historySummary(item) }}</td>
              <td class="px-3 py-3 text-right"><button type="button" class="min-h-10 rounded-md border border-[var(--color-brand)] px-3 font-semibold text-[var(--color-brand)]" :aria-label="`Abrir ${item.fecha}`" :disabled="saving" @click="openDate(item.fecha)">Abrir</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <form class="mt-5 rounded-lg border border-[var(--color-border)] bg-white p-4 sm:p-5" :aria-busy="saving || loadingDetail" @submit.prevent="save">
      <div class="flex flex-wrap items-end gap-4">
        <label class="block min-w-48 flex-1 text-sm font-semibold" for="class-date">Fecha de clase<input id="class-date" v-model="selectedDate" type="date" required :disabled="!editable || saving" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-3 font-normal" @change="openDate(selectedDate)" /></label>
        <label class="block min-w-64 flex-[2] text-sm font-semibold" for="class-topic">Tema desarrollado<input id="class-topic" v-model="topic" type="text" required :disabled="!editable || saving" :aria-invalid="validationError && !topic.trim() ? 'true' : undefined" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-3 font-normal" /></label>
        <button v-if="editable" type="button" class="min-h-11 rounded-md border border-[var(--color-brand)] px-4 font-semibold text-[var(--color-brand)]" :disabled="saving" @click="startNewClass">Nueva fecha</button>
      </div>

      <p v-if="loadingDetail" class="mt-4 text-sm text-[var(--color-graphite)]" role="status" aria-live="polite">Cargando detalle de la clase…</p>
      <p v-if="validationError" class="mt-4 rounded-md border border-[#edb8b8] bg-[#fff4f4] p-3 text-sm text-[#8b151b]" role="alert">{{ validationError }}</p>
      <p v-if="error" class="mt-4 rounded-md border border-[#edb8b8] bg-[#fff4f4] p-3 text-sm text-[#8b151b]" role="alert">{{ error }}</p>
      <p v-if="successMessage" class="mt-4 text-sm text-[var(--color-graphite)]" role="status" aria-live="polite">{{ successMessage }}</p>

      <p v-if="!students.length" class="mt-5 rounded-lg border border-dashed border-[var(--color-border)] p-4 text-[var(--color-graphite)]" role="status">No hay alumnos inscriptos</p>
      <div v-else-if="rows.length" class="mt-5 grid gap-4 lg:grid-cols-2">
        <fieldset v-for="row in rows" :key="row.alumnoId" :disabled="!editable || saving" class="rounded-lg border border-[var(--color-border)] p-4">
          <legend class="px-1 font-semibold">{{ row.apellidoNombre }} · DNI {{ row.dni }}</legend>
          <div class="mt-2 flex flex-wrap gap-4">
            <label class="inline-flex min-h-11 items-center gap-2"><input type="radio" :name="`attendance-${row.alumnoId}`" :checked="row.presente" @change="updatePresence(row, true)" />Presente</label>
            <label class="inline-flex min-h-11 items-center gap-2"><input type="radio" :name="`attendance-${row.alumnoId}`" :checked="!row.presente" @change="updatePresence(row, false)" />Ausente</label>
            <label v-if="!row.presente" class="inline-flex min-h-11 items-center gap-2"><input v-model="row.justificado" type="checkbox" />Ausencia justificada</label>
          </div>
          <label class="mt-3 block text-sm font-semibold" :for="`attendance-note-${row.alumnoId}`">Observación<textarea :id="`attendance-note-${row.alumnoId}`" v-model="row.observacion" rows="2" class="mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 font-normal" /></label>
          <p class="mt-2 text-sm text-[var(--color-graphite)]" role="status">Asistencia: {{ row.presente ? 'Presente' : row.justificado ? 'Ausente, justificada' : 'Ausente, sin justificar' }}</p>
        </fieldset>
      </div>

      <button v-if="editable && students.length" type="submit" class="mt-5 min-h-11 rounded-md bg-[var(--color-brand)] px-4 py-2.5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-55" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar clase' }}</button>
    </form>
  </section>
</template>
