import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { nextTick, type Component } from 'vue'
import type { EnrolledStudent, GradeRecord, TeacherCourse } from '../types/teacherCourses'

import GradesGrid from './GradesGrid.vue'

const activeCourse: TeacherCourse = {
  id: 12,
  materia: { id: 14, nombre: 'Álgebra y Geometría', esPromocionable: true },
  anioLectivo: new Date().getFullYear(),
  periodo: 'ANUAL',
  horarios: [],
  activo: true,
  editable: true,
}

const students: EnrolledStudent[] = [
  { alumnoId: 13, apellidoNombre: 'Lucía Fernández', dni: 42666888, email: 'lucia@example.test' },
  { alumnoId: 14, apellidoNombre: 'Marcos Acosta', dni: 30111222, email: 'marcos@example.test' },
]

const partialGrades: GradeRecord[] = [
  { id: 101, cursadaId: 12, tipoCalificacion: 'PARCIAL', numero: 1, nota: 8, fechaEvaluacion: '2026-04-10', parcialOriginalId: null, observacion: 'Muy buen trabajo', alumno: { alumnoId: 13, apellidoNombre: 'Lucía Fernández', dni: 42666888 } },
  { id: 102, cursadaId: 12, tipoCalificacion: 'PARCIAL', numero: 1, nota: 5, fechaEvaluacion: '2026-04-10', parcialOriginalId: null, observacion: null, alumno: { alumnoId: 14, apellidoNombre: 'Marcos Acosta', dni: 30111222 } },
  { id: 103, cursadaId: 12, tipoCalificacion: 'PARCIAL', numero: 2, nota: 9, fechaEvaluacion: '2026-06-12', parcialOriginalId: null, observacion: null, alumno: { alumnoId: 13, apellidoNombre: 'Lucía Fernández', dni: 42666888 } },
]

function renderGrid(options: { course?: TeacherCourse; grades?: GradeRecord[]; students?: EnrolledStudent[] } = {}) {
  const onSave = vi.fn()
  const rendered = render(GradesGrid as Component, {
    props: {
      course: options.course ?? activeCourse,
      grades: options.grades ?? [],
      students: options.students ?? students,
      onSave,
    },
  })
  return { ...rendered, onSave }
}

function fillNote(studentName: string, value: string, observation?: string) {
  const group = screen.getByRole('group', { name: new RegExp(studentName) })
  fireEvent.update(within(group).getByLabelText('Nota'), value)
  if (observation !== undefined) fireEvent.update(within(group).getByLabelText('Observación'), observation)
  return group
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GradesGrid', () => {
  it('shows the approved evaluation types and only exposes the integrative instance for promotable courses', async () => {
    const user = userEvent.setup()
    renderGrid()

    const type = screen.getByLabelText('Tipo de evaluación')
    expect(within(type).getByRole('option', { name: 'Parcial' })).toBeInTheDocument()
    expect(within(type).getByRole('option', { name: 'Recuperatorio' })).toBeInTheDocument()
    expect(within(type).getByRole('option', { name: 'Trabajo práctico' })).toBeInTheDocument()
    expect(within(type).getByRole('option', { name: 'Instancia integradora' })).toBeInTheDocument()

    await user.selectOptions(type, 'EXAMEN_FINAL')
    expect(screen.getByText('Instancia integradora')).toBeVisible()

    renderGrid({ course: { ...activeCourse, materia: { ...activeCourse.materia, esPromocionable: false } } })
    expect(within(screen.getAllByLabelText('Tipo de evaluación').at(-1)!).queryByRole('option', { name: 'Instancia integradora' })).not.toBeInTheDocument()
  })

  it('emits one complete valid batch, omits blank rows and preserves integer note constraints', async () => {
    const user = userEvent.setup()
    const { onSave } = renderGrid()

    expect(screen.getAllByLabelText('Nota', { selector: 'input' })[0]).toHaveAttribute('min', '0')
    expect(screen.getAllByLabelText('Nota', { selector: 'input' })[0]).toHaveAttribute('max', '10')
    expect(screen.getAllByLabelText('Nota', { selector: 'input' })[0]).toHaveAttribute('step', '1')
    fireEvent.update(screen.getByLabelText('Número de evaluación'), '2')
    await nextTick()
    fireEvent.update(screen.getByLabelText('Fecha de evaluación'), '2026-09-10')
    fillNote('Lucía Fernández', '8', 'Rindió con claridad')

    await user.click(screen.getByRole('button', { name: 'Guardar calificaciones' }))

    expect(onSave).toHaveBeenCalledWith({
        cursadaId: 12,
        calificaciones: [{
          alumnoId: 13,
          tipoCalificacion: 'PARCIAL',
          numero: 2,
          fechaEvaluacion: '2026-09-10',
          nota: 8,
          observacion: 'Rindió con claridad',
        }],
    })
  })

  it('rejects a partially completed student row without emitting a batch', async () => {
    const user = userEvent.setup()
    renderGrid()
    fireEvent.update(screen.getByLabelText('Número de evaluación'), '1')
    await nextTick()
    fireEvent.update(screen.getByLabelText('Fecha de evaluación'), '2026-09-10')
    fillNote('Lucía Fernández', '', 'Falta la nota')

    await user.click(screen.getByRole('button', { name: 'Guardar calificaciones' }))

    expect(screen.getByRole('alert')).toHaveTextContent(/nota de Lucía Fernández/i)
    expect(screen.queryByText('Calificaciones guardadas')).not.toBeInTheDocument()
  })

  it('derives each recuperatory number from the selected original partial of the same student', async () => {
    const user = userEvent.setup()
    const { onSave } = renderGrid({ grades: partialGrades })
    await user.selectOptions(screen.getByLabelText('Tipo de evaluación'), 'RECUPERATORIO')

    const lucia = screen.getByRole('group', { name: /Lucía Fernández/ })
    const marcos = screen.getByRole('group', { name: /Marcos Acosta/ })
    expect(within(lucia).getByLabelText('Parcial original')).toHaveValue('101')
    expect(within(lucia).getByRole('option', { name: /Parcial 2/ })).toBeInTheDocument()
    expect(within(marcos).queryByRole('option', { name: /Parcial 2/ })).not.toBeInTheDocument()
    await user.selectOptions(within(lucia).getByLabelText('Parcial original'), '103')
    await user.selectOptions(within(marcos).getByLabelText('Parcial original'), '102')
    fillNote('Lucía Fernández', '6')
    fillNote('Marcos Acosta', '7')
    await user.click(screen.getByRole('button', { name: 'Guardar calificaciones' }))

    expect(onSave).toHaveBeenCalledWith({
        cursadaId: 12,
        calificaciones: [
          { alumnoId: 13, tipoCalificacion: 'RECUPERATORIO', numero: 2, parcialOriginalId: 103, nota: 6, observacion: null },
          { alumnoId: 14, tipoCalificacion: 'RECUPERATORIO', numero: 1, parcialOriginalId: 102, nota: 7, observacion: null },
        ],
    })
  })

  it('keeps multiple recuperatories of one student isolated when changing the original partial', async () => {
    const user = userEvent.setup()
    const recoveryGrades: GradeRecord[] = [
      ...partialGrades,
      { id: 201, cursadaId: 12, tipoCalificacion: 'RECUPERATORIO', numero: 1, nota: 6, fechaEvaluacion: '2026-05-10', parcialOriginalId: 101, observacion: 'Recuperatorio del primer parcial', alumno: { alumnoId: 13, apellidoNombre: 'Lucía Fernández', dni: 42666888 } },
      { id: 202, cursadaId: 12, tipoCalificacion: 'RECUPERATORIO', numero: 2, nota: 4, fechaEvaluacion: '2026-07-10', parcialOriginalId: 103, observacion: 'Recuperatorio del segundo parcial', alumno: { alumnoId: 13, apellidoNombre: 'Lucía Fernández', dni: 42666888 } },
    ]
    const { onSave } = renderGrid({ grades: recoveryGrades })

    await user.selectOptions(screen.getByLabelText('Tipo de evaluación'), 'RECUPERATORIO')
    const lucia = screen.getByRole('group', { name: /Lucía Fernández/ })
    expect(within(lucia).getByLabelText('Parcial original')).toHaveValue('101')
    expect(within(lucia).getByLabelText('Nota')).toHaveValue(6)
    expect(within(lucia).getByLabelText('Observación')).toHaveValue('Recuperatorio del primer parcial')
    expect(screen.getByLabelText('Fecha de evaluación')).toHaveValue('2026-05-10')

    await user.selectOptions(within(lucia).getByLabelText('Parcial original'), '103')
    expect(within(lucia).getByLabelText('Nota')).toHaveValue(4)
    expect(within(lucia).getByLabelText('Observación')).toHaveValue('Recuperatorio del segundo parcial')
    expect(screen.getByLabelText('Fecha de evaluación')).toHaveValue('2026-07-10')

    await user.selectOptions(within(lucia).getByLabelText('Parcial original'), '101')
    expect(within(lucia).getByLabelText('Nota')).toHaveValue(6)
    expect(within(lucia).getByLabelText('Observación')).toHaveValue('Recuperatorio del primer parcial')
    expect(screen.getByLabelText('Fecha de evaluación')).toHaveValue('2026-05-10')

    await user.click(screen.getByRole('button', { name: 'Guardar calificaciones' }))
    expect(onSave).toHaveBeenCalledWith({
      cursadaId: 12,
      calificaciones: [{
        alumnoId: 13,
        tipoCalificacion: 'RECUPERATORIO',
        numero: 1,
        parcialOriginalId: 101,
        fechaEvaluacion: '2026-05-10',
        nota: 6,
        observacion: 'Recuperatorio del primer parcial',
      }],
    })
  })

  it('preloads the selected recuperatory date, clears it when absent, and sends a manually entered date', async () => {
    const user = userEvent.setup()
    const recoveryGrades: GradeRecord[] = [
      ...partialGrades,
      { id: 104, cursadaId: 12, tipoCalificacion: 'PARCIAL', numero: 3, nota: 7, fechaEvaluacion: '2026-08-10', parcialOriginalId: null, observacion: null, alumno: { alumnoId: 13, apellidoNombre: 'Lucía Fernández', dni: 42666888 } },
      { id: 201, cursadaId: 12, tipoCalificacion: 'RECUPERATORIO', numero: 1, nota: 6, fechaEvaluacion: '2026-05-10', parcialOriginalId: 101, observacion: 'Recuperatorio del primer parcial', alumno: { alumnoId: 13, apellidoNombre: 'Lucía Fernández', dni: 42666888 } },
      { id: 202, cursadaId: 12, tipoCalificacion: 'RECUPERATORIO', numero: 2, nota: 4, fechaEvaluacion: '2026-07-10', parcialOriginalId: 103, observacion: 'Recuperatorio del segundo parcial', alumno: { alumnoId: 13, apellidoNombre: 'Lucía Fernández', dni: 42666888 } },
    ]
    const { onSave } = renderGrid({ grades: recoveryGrades, students: [students[0]] })
    await user.selectOptions(screen.getByLabelText('Tipo de evaluación'), 'RECUPERATORIO')

    const lucia = screen.getByRole('group', { name: /Lucía Fernández/ })
    expect(screen.getByLabelText('Fecha de evaluación')).toHaveValue('2026-05-10')
    await user.selectOptions(within(lucia).getByLabelText('Parcial original'), '104')
    expect(screen.getByLabelText('Fecha de evaluación')).toHaveValue('')
    await user.selectOptions(within(lucia).getByLabelText('Parcial original'), '103')
    expect(screen.getByLabelText('Fecha de evaluación')).toHaveValue('2026-07-10')

    fireEvent.update(screen.getByLabelText('Fecha de evaluación'), '2026-08-20')
    await user.click(screen.getByRole('button', { name: 'Guardar calificaciones' }))

    expect(onSave).toHaveBeenCalledWith({
      cursadaId: 12,
      calificaciones: [{
        alumnoId: 13,
        tipoCalificacion: 'RECUPERATORIO',
        numero: 2,
        parcialOriginalId: 103,
        fechaEvaluacion: '2026-08-20',
        nota: 4,
        observacion: 'Recuperatorio del segundo parcial',
      }],
    })
  })

  it('preserves each persisted date when different recuperatories are saved again', async () => {
    const user = userEvent.setup()
    const recoveryGrades: GradeRecord[] = [
      ...partialGrades,
      { id: 201, cursadaId: 12, tipoCalificacion: 'RECUPERATORIO', numero: 1, nota: 6, fechaEvaluacion: '2026-05-10', parcialOriginalId: 101, observacion: null, alumno: { alumnoId: 13, apellidoNombre: 'Lucía Fernández', dni: 42666888 } },
      { id: 202, cursadaId: 12, tipoCalificacion: 'RECUPERATORIO', numero: 1, nota: 7, fechaEvaluacion: '2026-05-11', parcialOriginalId: 102, observacion: null, alumno: { alumnoId: 14, apellidoNombre: 'Marcos Acosta', dni: 30111222 } },
    ]
    const { onSave } = renderGrid({ grades: recoveryGrades })

    await user.selectOptions(screen.getByLabelText('Tipo de evaluación'), 'RECUPERATORIO')
    await user.click(screen.getByRole('button', { name: 'Guardar calificaciones' }))

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      calificaciones: expect.arrayContaining([
        expect.objectContaining({ alumnoId: 13, fechaEvaluacion: '2026-05-10' }),
        expect.objectContaining({ alumnoId: 14, fechaEvaluacion: '2026-05-11' }),
      ]),
    }))
  })

  it('keeps a dated recovery row and omits a date for a new row without inventing one', async () => {
    const user = userEvent.setup()
    const recoveryGrades: GradeRecord[] = [
      ...partialGrades,
      { id: 201, cursadaId: 12, tipoCalificacion: 'RECUPERATORIO', numero: 1, nota: 6, fechaEvaluacion: '2026-05-10', parcialOriginalId: 101, observacion: null, alumno: { alumnoId: 13, apellidoNombre: 'Lucía Fernández', dni: 42666888 } },
    ]
    const { onSave } = renderGrid({ grades: recoveryGrades })

    await user.selectOptions(screen.getByLabelText('Tipo de evaluación'), 'RECUPERATORIO')
    fillNote('Marcos Acosta', '7')
    await user.click(screen.getByRole('button', { name: 'Guardar calificaciones' }))

    expect(screen.getByLabelText('Fecha de evaluación')).toHaveValue('2026-05-10')
    const payload = onSave.mock.calls[0]?.[0]
    expect(payload.calificaciones).toEqual(expect.arrayContaining([
      expect.objectContaining({ alumnoId: 13, fechaEvaluacion: '2026-05-10' }),
      expect.objectContaining({ alumnoId: 14 }),
    ]))
    expect(payload.calificaciones.find((grade: { alumnoId: number }) => grade.alumnoId === 14)).not.toHaveProperty('fechaEvaluacion')
  })

  it('applies an explicitly entered common recovery date to every submitted row', async () => {
    const user = userEvent.setup()
    const recoveryGrades: GradeRecord[] = [
      ...partialGrades,
      { id: 201, cursadaId: 12, tipoCalificacion: 'RECUPERATORIO', numero: 1, nota: 6, fechaEvaluacion: '2026-05-10', parcialOriginalId: 101, observacion: null, alumno: { alumnoId: 13, apellidoNombre: 'Lucía Fernández', dni: 42666888 } },
      { id: 202, cursadaId: 12, tipoCalificacion: 'RECUPERATORIO', numero: 1, nota: 7, fechaEvaluacion: '2026-05-11', parcialOriginalId: 102, observacion: null, alumno: { alumnoId: 14, apellidoNombre: 'Marcos Acosta', dni: 30111222 } },
    ]
    const { onSave } = renderGrid({ grades: recoveryGrades })

    await user.selectOptions(screen.getByLabelText('Tipo de evaluación'), 'RECUPERATORIO')
    fireEvent.update(screen.getByLabelText('Fecha de evaluación'), '2026-09-01')
    await user.click(screen.getByRole('button', { name: 'Guardar calificaciones' }))

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      calificaciones: expect.arrayContaining([
        expect.objectContaining({ alumnoId: 13, fechaEvaluacion: '2026-09-01' }),
        expect.objectContaining({ alumnoId: 14, fechaEvaluacion: '2026-09-01' }),
      ]),
    }))
  })

  it('omits a persisted optional date when the common date is explicitly cleared', async () => {
    const user = userEvent.setup()
    const recoveryGrades: GradeRecord[] = [
      ...partialGrades,
      { id: 201, cursadaId: 12, tipoCalificacion: 'RECUPERATORIO', numero: 1, nota: 6, fechaEvaluacion: '2026-05-10', parcialOriginalId: 101, observacion: null, alumno: { alumnoId: 13, apellidoNombre: 'Lucía Fernández', dni: 42666888 } },
    ]
    const { onSave } = renderGrid({ grades: recoveryGrades, students: [students[0]] })

    await user.selectOptions(screen.getByLabelText('Tipo de evaluación'), 'RECUPERATORIO')
    expect(screen.getByLabelText('Fecha de evaluación')).toHaveValue('2026-05-10')
    fireEvent.update(screen.getByLabelText('Fecha de evaluación'), '')
    await user.click(screen.getByRole('button', { name: 'Guardar calificaciones' }))

    expect(onSave).toHaveBeenCalledWith({
      cursadaId: 12,
      calificaciones: [{
        alumnoId: 13,
        tipoCalificacion: 'RECUPERATORIO',
        numero: 1,
        parcialOriginalId: 101,
        nota: 6,
        observacion: null,
      }],
    })
  })

  it('rejects a partial batch when its common persisted date is explicitly cleared', async () => {
    const user = userEvent.setup()
    const { onSave } = renderGrid({ grades: partialGrades, students: [students[0]] })

    expect(screen.getByLabelText('Fecha de evaluación')).toHaveValue('2026-04-10')
    fireEvent.update(screen.getByLabelText('Fecha de evaluación'), '')
    await user.click(screen.getByRole('button', { name: 'Guardar calificaciones' }))

    expect(screen.getByRole('alert')).toHaveTextContent(/fecha de evaluación del parcial/i)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('leaves the common recovery date empty when selected persisted dates conflict', async () => {
    const user = userEvent.setup()
    const recoveryGrades: GradeRecord[] = [
      ...partialGrades,
      { id: 201, cursadaId: 12, tipoCalificacion: 'RECUPERATORIO', numero: 1, nota: 6, fechaEvaluacion: '2026-05-10', parcialOriginalId: 101, observacion: null, alumno: { alumnoId: 13, apellidoNombre: 'Lucía Fernández', dni: 42666888 } },
      { id: 202, cursadaId: 12, tipoCalificacion: 'RECUPERATORIO', numero: 1, nota: 7, fechaEvaluacion: '2026-05-11', parcialOriginalId: 102, observacion: null, alumno: { alumnoId: 14, apellidoNombre: 'Marcos Acosta', dni: 30111222 } },
    ]
    renderGrid({ grades: recoveryGrades })

    await user.selectOptions(screen.getByLabelText('Tipo de evaluación'), 'RECUPERATORIO')

    expect(screen.getByLabelText('Fecha de evaluación')).toHaveValue('')
  })

  it('clears the date when a non-recovery evaluation has no persisted record', async () => {
    renderGrid({ grades: partialGrades })

    expect(screen.getByLabelText('Fecha de evaluación')).toHaveValue('2026-04-10')
    fireEvent.update(screen.getByLabelText('Número de evaluación'), '3')
    await nextTick()

    expect(screen.getByLabelText('Fecha de evaluación')).toHaveValue('')
  })

  it('rejects a new partial row without a date even when an existing row preloads the common date', async () => {
    const user = userEvent.setup()
    const newStudent: EnrolledStudent = { alumnoId: 15, apellidoNombre: 'Ana López', dni: 39999111, email: 'ana@example.test' }
    const { onSave } = renderGrid({ grades: partialGrades, students: [...students, newStudent] })
    fillNote('Ana López', '7')

    await user.click(screen.getByRole('button', { name: 'Guardar calificaciones' }))

    expect(screen.getByRole('alert')).toHaveTextContent(/fecha de evaluación del parcial/i)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('preloads existing values by student and evaluation without mixing rows', async () => {
    renderGrid({ grades: partialGrades })
    fireEvent.update(screen.getByLabelText('Número de evaluación'), '1')

    expect(within(screen.getByRole('group', { name: /Lucía Fernández/ })).getByLabelText('Nota')).toHaveValue(8)
    expect(within(screen.getByRole('group', { name: /Lucía Fernández/ })).getByLabelText('Observación')).toHaveValue('Muy buen trabajo')
    expect(within(screen.getByRole('group', { name: /Marcos Acosta/ })).getByLabelText('Nota')).toHaveValue(5)
    expect(within(screen.getByRole('group', { name: /Marcos Acosta/ })).getByLabelText('Observación')).toHaveValue('')
  })

  it('announces that no grades are loaded yet while keeping the current evaluation ready for entry', () => {
    renderGrid()

    expect(screen.getByRole('status')).toHaveTextContent('No hay calificaciones cargadas todavía.')
    expect(screen.getByRole('button', { name: 'Guardar calificaciones' })).toBeVisible()
  })

  it('keeps a historical course consultable but removes editing controls', () => {
    renderGrid({ course: { ...activeCourse, anioLectivo: new Date().getFullYear() - 1, editable: false }, grades: partialGrades })

    expect(screen.getByText('Solo lectura: cursada histórica')).toBeVisible()
    expect(screen.getByLabelText('Tipo de evaluación')).toBeDisabled()
    expect(screen.getByLabelText('Número de evaluación')).toBeDisabled()
    expect(screen.getByRole('group', { name: /Lucía Fernández/ })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.queryByRole('button', { name: 'Guardar calificaciones' })).not.toBeInTheDocument()
  })
})
