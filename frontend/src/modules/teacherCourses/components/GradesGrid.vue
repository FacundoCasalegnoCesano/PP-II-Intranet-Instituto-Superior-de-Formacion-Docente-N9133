<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { gradeTypeLabel } from '@/core/presentation/academicLabels'
import type {
  EnrolledStudent,
  GradeRecord,
  GradeType,
  SaveGradesPayload,
  TeacherCourse,
} from '../types/teacherCourses'

const props = withDefaults(defineProps<{
  course: TeacherCourse
  students: EnrolledStudent[]
  grades: GradeRecord[]
  saving?: boolean
}>(), {
  students: () => [],
  grades: () => [],
  saving: false,
})

const emit = defineEmits<{
  save: [payload: SaveGradesPayload]
}>()

type DraftRow = {
  nota: string
  observacion: string
  parcialOriginalId: string
  fechaEvaluacion: string
}

const currentYear = Number(new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric',
}).format(new Date()))

const selectedType = ref<GradeType>('PARCIAL')
const selectedNumber = ref('1')
const selectedDate = ref('')
const selectedDateExplicit = ref(false)
const drafts = ref<Record<number, DraftRow>>({})
const validationError = ref('')

const editable = computed(() => (
  (props.course.editable ?? (props.course.activo && props.course.anioLectivo === currentYear))
  && props.course.anioLectivo === currentYear
))

const evaluationOptions = computed<Array<{ value: GradeType; label: string }>>(() => [
  { value: 'PARCIAL', label: gradeTypeLabel('PARCIAL', 'CURSADA') },
  { value: 'RECUPERATORIO', label: gradeTypeLabel('RECUPERATORIO', 'CURSADA') },
  { value: 'TRABAJO_PRACTICO', label: gradeTypeLabel('TRABAJO_PRACTICO', 'CURSADA') },
  ...(props.course.materia.esPromocionable === true
    ? [{ value: 'EXAMEN_FINAL' as const, label: gradeTypeLabel('EXAMEN_FINAL', 'CURSADA') }]
    : []),
])

const rows = computed(() => props.students.map(student => ({
  ...student,
  draft: drafts.value[student.alumnoId] ?? { nota: '', observacion: '', parcialOriginalId: '', fechaEvaluacion: '' },
})))

function existingForStudent(studentId: number, parcialOriginalId?: number): GradeRecord | undefined {
  if (selectedType.value === 'RECUPERATORIO') {
    const original = originalPartialsForStudent(studentId).find(partial => partial.id === parcialOriginalId)
    if (!original) return undefined
    return props.grades.find(grade => (
      grade.alumno.alumnoId === studentId
      && grade.tipoCalificacion === 'RECUPERATORIO'
      && grade.parcialOriginalId === parcialOriginalId
      && grade.numero === original.numero
    ))
  }

  return props.grades.find(grade => (
    grade.alumno.alumnoId === studentId
    && grade.tipoCalificacion === selectedType.value
    && grade.numero === Number(selectedNumber.value)
  ))
}

function originalPartialsForStudent(studentId: number): GradeRecord[] {
  return props.grades
    .filter(grade => grade.alumno.alumnoId === studentId && grade.tipoCalificacion === 'PARCIAL')
    .sort((first, second) => first.numero - second.numero)
}

function commonPersistedDate(currentDrafts: Record<number, DraftRow>): string {
  const dates = Object.values(currentDrafts)
    .map(draft => draft.fechaEvaluacion)
    .filter(Boolean)
  if (!dates.length) return ''
  const firstDate = dates[0]
  return dates.every(date => date === firstDate) ? firstDate : ''
}

function effectiveDateForDraft(draft: DraftRow): string {
  return selectedDateExplicit.value ? selectedDate.value : draft.fechaEvaluacion
}

function syncDrafts(): void {
  const next: Record<number, DraftRow> = {}
  for (const student of props.students) {
    const originals = originalPartialsForStudent(student.alumnoId)
    const previousOriginalId = Number(drafts.value[student.alumnoId]?.parcialOriginalId)
    const originalId = originals.some(original => original.id === previousOriginalId)
      ? previousOriginalId
      : props.grades.find(grade => grade.alumno.alumnoId === student.alumnoId && grade.tipoCalificacion === 'RECUPERATORIO')?.parcialOriginalId ?? originals[0]?.id
    const existing = existingForStudent(student.alumnoId, originalId)
    next[student.alumnoId] = {
      nota: existing ? String(existing.nota) : '',
      observacion: existing?.observacion ?? '',
      parcialOriginalId: originalId ? String(originalId) : '',
      fechaEvaluacion: existing?.fechaEvaluacion?.slice(0, 10) ?? '',
    }
  }
  drafts.value = next
  selectedDate.value = commonPersistedDate(next)
  selectedDateExplicit.value = false
}

function setType(value: string): void {
  selectedType.value = value as GradeType
  selectedDate.value = ''
  selectedDateExplicit.value = false
  if (selectedType.value !== 'RECUPERATORIO' && !selectedNumber.value) selectedNumber.value = '1'
  validationError.value = ''
}

function setOriginalPartials(studentId: number, value: string): void {
  const current = drafts.value[studentId]
  if (!current || current.parcialOriginalId === value) return
  const originalId = Number(value)
  const existing = existingForStudent(studentId, originalId)
  drafts.value[studentId] = {
    nota: existing ? String(existing.nota) : '',
    observacion: existing?.observacion ?? '',
    parcialOriginalId: value,
    fechaEvaluacion: existing?.fechaEvaluacion?.slice(0, 10) ?? '',
  }
  selectedDate.value = commonPersistedDate(drafts.value)
  selectedDateExplicit.value = false
}

function originalLabel(grade: GradeRecord): string {
  return `Parcial ${grade.numero} · ${grade.nota}`
}

function validateAndBuild(): SaveGradesPayload | null {
  const type = selectedType.value
  const number = Number(selectedNumber.value)
  if (type !== 'RECUPERATORIO' && (!Number.isInteger(number) || number < 1)) {
    validationError.value = 'Indicá un número de evaluación entero mayor que cero.'
    return null
  }
  const hasEnteredRows = rows.value.some(row => Boolean(String(row.draft.nota ?? '').trim() || String(row.draft.observacion ?? '').trim()))
  const hasEnteredRowWithoutDate = rows.value.some(row => {
    const hasRow = String(row.draft.nota ?? '').trim() || String(row.draft.observacion ?? '').trim()
    return Boolean(hasRow) && !effectiveDateForDraft(row.draft)
  })
  if (type === 'PARCIAL' && (!hasEnteredRows || hasEnteredRowWithoutDate)) {
    validationError.value = 'Indicá la fecha de evaluación del parcial.'
    return null
  }

  const calificaciones = [] as SaveGradesPayload['calificaciones']
  for (const row of rows.value) {
    const notaText = String(row.draft.nota ?? '').trim()
    const observacion = String(row.draft.observacion ?? '').trim()
    if (!notaText && !observacion) continue
    if (!notaText) {
      validationError.value = `Completá la nota de ${row.apellidoNombre}.`
      return null
    }
    const nota = Number(notaText)
    if (!Number.isInteger(nota) || nota < 0 || nota > 10) {
      validationError.value = `La nota de ${row.apellidoNombre} debe ser un entero entre 0 y 10.`
      return null
    }

    let numero = number
    let parcialOriginalId: number | undefined
    if (type === 'RECUPERATORIO') {
      parcialOriginalId = Number(row.draft.parcialOriginalId)
      const original = originalPartialsForStudent(row.alumnoId).find(partial => partial.id === parcialOriginalId)
      if (!original) {
        validationError.value = `Seleccioná el parcial original de ${row.apellidoNombre}.`
        return null
      }
      numero = original.numero
    }

    const fechaEvaluacion = effectiveDateForDraft(row.draft)

    calificaciones.push({
      alumnoId: row.alumnoId,
      tipoCalificacion: type,
      numero,
      ...(fechaEvaluacion ? { fechaEvaluacion } : {}),
      ...(parcialOriginalId ? { parcialOriginalId } : {}),
      nota,
      observacion: observacion || null,
    })
  }

  if (!calificaciones.length) {
    validationError.value = 'Completá al menos una calificación antes de guardar.'
    return null
  }
  validationError.value = ''
  return { cursadaId: props.course.id, calificaciones }
}

function save(): void {
  if (!editable.value || props.saving) return
  const payload = validateAndBuild()
  if (payload) emit('save', payload)
}

watch(
  [selectedType, selectedNumber, () => props.grades, () => props.students],
  () => syncDrafts(),
  { immediate: true },
)
</script>

<template>
  <section aria-labelledby="grades-grid-title" class="mt-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h3 id="grades-grid-title" class="text-xl font-semibold">Calificaciones</h3>
        <p class="mt-1 text-sm text-[var(--color-graphite)]">Elegí una evaluación y cargá las notas de los alumnos inscriptos.</p>
      </div>
      <p v-if="!editable" class="font-semibold text-[var(--color-graphite)]">Solo lectura: cursada histórica</p>
    </div>

    <form class="mt-5 rounded-lg border border-[var(--color-border)] bg-white p-4 sm:p-5" :aria-busy="props.saving" :aria-disabled="!editable ? 'true' : undefined" @submit.prevent="save">
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label class="block text-sm font-semibold" for="grade-type">Tipo de evaluación
          <select id="grade-type" :value="selectedType" :disabled="!editable || props.saving" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-3 font-normal" @change="setType(($event.target as HTMLSelectElement).value)">
            <option v-for="option in evaluationOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </label>
        <label v-if="selectedType !== 'RECUPERATORIO'" class="block text-sm font-semibold" for="grade-number">Número de evaluación
          <input id="grade-number" v-model="selectedNumber" type="number" min="1" max="99" step="1" :aria-required="selectedType !== 'RECUPERATORIO' ? 'true' : undefined" :disabled="!editable || props.saving" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] px-3 font-normal" />
        </label>
        <p v-else class="rounded-md border border-dashed border-[var(--color-border)] p-3 text-sm text-[var(--color-graphite)]">El número se deriva del parcial original de cada alumno.</p>
        <label class="block text-sm font-semibold" for="grade-date">Fecha de evaluación
          <input id="grade-date" v-model="selectedDate" type="date" :aria-required="selectedType === 'PARCIAL' ? 'true' : undefined" :disabled="!editable || props.saving" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-3 font-normal" @input="selectedDateExplicit = true" />
        </label>
      </div>

      <p v-if="validationError" class="mt-4 rounded-md border border-[#edb8b8] bg-[#fff4f4] p-3 text-sm text-[#8b151b]" role="alert" aria-live="assertive">{{ validationError }}</p>
      <p v-if="!students.length" class="mt-5 rounded-lg border border-dashed border-[var(--color-border)] p-4 text-[var(--color-graphite)]" role="status">No hay alumnos inscriptos</p>
      <div v-else>
        <p v-if="!grades.length" class="mt-5 rounded-lg border border-dashed border-[var(--color-border)] p-4 text-[var(--color-graphite)]" role="status">No hay calificaciones cargadas todavía. Podés cargar la primera evaluación.</p>
        <div class="mt-5 grid gap-4 lg:grid-cols-2" aria-label="Alumnos y calificaciones">
          <fieldset v-for="row in rows" :key="row.alumnoId" :disabled="!editable || props.saving" :aria-disabled="!editable ? 'true' : undefined" class="rounded-lg border border-[var(--color-border)] p-4">
            <legend class="px-1 font-semibold"><span>{{ row.apellidoNombre }}</span><span class="font-normal"> · DNI {{ row.dni }}</span></legend>
            <div class="mt-2 grid gap-3 sm:grid-cols-[minmax(7rem,10rem)_1fr]">
              <label class="block text-sm font-semibold" :for="`grade-note-${row.alumnoId}`">Nota
                <input :id="`grade-note-${row.alumnoId}`" v-model="row.draft.nota" type="number" min="0" max="10" step="1" inputmode="numeric" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] px-3 font-normal" />
              </label>
              <label class="block text-sm font-semibold" :for="`grade-observation-${row.alumnoId}`">Observación
                <textarea :id="`grade-observation-${row.alumnoId}`" v-model="row.draft.observacion" rows="2" maxlength="5000" class="mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 font-normal" />
              </label>
            </div>
            <label v-if="selectedType === 'RECUPERATORIO'" class="mt-3 block text-sm font-semibold" :for="`grade-original-${row.alumnoId}`">Parcial original
              <select :id="`grade-original-${row.alumnoId}`" :value="row.draft.parcialOriginalId" class="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-3 font-normal" @change="setOriginalPartials(row.alumnoId, ($event.target as HTMLSelectElement).value)">
                <option value="">Seleccioná un parcial</option>
                <option v-for="original in originalPartialsForStudent(row.alumnoId)" :key="original.id" :value="String(original.id)">{{ originalLabel(original) }}</option>
              </select>
            </label>
          </fieldset>
        </div>
      </div>

      <button v-if="editable && students.length" type="submit" class="mt-5 min-h-11 rounded-md bg-[var(--color-brand)] px-4 py-2.5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-55" :disabled="props.saving">{{ props.saving ? 'Guardando…' : 'Guardar calificaciones' }}</button>
    </form>
  </section>
</template>
