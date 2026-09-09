import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import type { Component } from 'vue'
import type { ClassRecord, ClassSummary, EnrolledStudent, TeacherCourse } from '../types/teacherCourses'

const mocks = vi.hoisted(() => ({
  listClasses: vi.fn(),
  getClass: vi.fn(),
  saveClass: vi.fn(),
}))

vi.mock('../api/teacherCoursesApi', () => ({
  teacherCoursesApi: {
    listClasses: mocks.listClasses,
    getClass: mocks.getClass,
    saveClass: mocks.saveClass,
  },
}))

import ClassRegister from './ClassRegister.vue'

const activeCourse: TeacherCourse = {
  id: 12,
  materia: { id: 14, nombre: 'Álgebra y Geometría' },
  anioLectivo: new Date().getFullYear(),
  periodo: 'ANUAL',
  horarios: [],
  activo: true,
  editable: true,
}

const students: EnrolledStudent[] = [
  { alumnoId: 13, apellidoNombre: 'Lucia Test', dni: 42666888, email: 'lucia@example.test' },
  { alumnoId: 22, apellidoNombre: 'Ana Pérez', dni: 40111222, email: 'ana@example.test' },
]

const existingClass: ClassSummary = {
  fecha: '2026-09-08',
  temaDesarrollado: 'Ecuaciones',
  presentes: 1,
  ausentes: 1,
  ausentesJustificados: 1,
}

const existingDetail: ClassRecord = {
  fecha: existingClass.fecha,
  temaDesarrollado: existingClass.temaDesarrollado,
  asistencias: [
    { alumnoId: 13, nombre: 'Lucia Test', dni: 42666888, presente: true, justificado: false, observacion: null },
    { alumnoId: 22, nombre: 'Ana Pérez', dni: 40111222, presente: false, justificado: true, observacion: 'Turno médico' },
  ],
}

function renderRegister(options: { course?: TeacherCourse; students?: EnrolledStudent[]; classes?: ClassSummary[] } = {}) {
  return render(ClassRegister as Component, {
    props: {
      course: options.course ?? activeCourse,
      students: options.students ?? students,
      classes: options.classes ?? [],
    },
  })
}

function fillNewClass(topic = 'Ecuaciones') {
  fireEvent.update(screen.getByLabelText('Fecha de clase'), '2026-09-10')
  fireEvent.update(screen.getByLabelText('Tema desarrollado'), topic)
}

beforeEach(() => {
  mocks.listClasses.mockReset().mockResolvedValue([])
  mocks.getClass.mockReset()
  mocks.saveClass.mockReset().mockResolvedValue({ fecha: '2026-09-10', temaDesarrollado: 'Ecuaciones', registros: 2 })
})

describe('ClassRegister', () => {
  it('requires a calendar date and descriptive topic before saving', () => {
    renderRegister()

    expect(screen.getByLabelText('Fecha de clase')).toBeRequired()
    expect(screen.getByLabelText('Tema desarrollado')).toBeRequired()
    expect(screen.getByRole('button', { name: 'Guardar clase' })).toBeInTheDocument()
  })

  it('starts a new date with every enrolled student present', () => {
    renderRegister()

    for (const student of students) {
      const group = screen.getByRole('group', { name: new RegExp(student.apellidoNombre) })
      expect(within(group).getByLabelText('Presente')).toBeChecked()
      expect(within(group).queryByLabelText('Ausencia justificada')).not.toBeInTheDocument()
    }
  })

  it('supports absent, justified and observation values per student', async () => {
    const user = userEvent.setup()
    renderRegister()
    fillNewClass()

    const group = screen.getByRole('group', { name: /Ana Pérez/ })
    await user.click(within(group).getByLabelText('Ausente'))
    await user.click(within(group).getByLabelText('Ausencia justificada'))
    await user.type(within(group).getByLabelText('Observación'), 'Turno médico')

    expect(within(group).getByLabelText('Ausente')).toBeChecked()
    expect(within(group).getByLabelText('Ausencia justificada')).toBeChecked()
    expect(within(group).getByLabelText('Observación')).toHaveValue('Turno médico')

    await user.click(screen.getByRole('button', { name: 'Guardar clase' }))
    await waitFor(() => expect(mocks.saveClass).toHaveBeenCalled())
    expect(mocks.saveClass.mock.calls[0][2].asistencias[1]).toEqual({
      alumnoId: 22,
      presente: false,
      justificado: true,
      observacion: 'Turno médico',
    })
  })

  it('sends exactly one normalized row for every enrolled student', async () => {
    const user = userEvent.setup()
    renderRegister()
    fillNewClass()

    const lucia = screen.getByRole('group', { name: /Lucia Test/ })
    const ana = screen.getByRole('group', { name: /Ana Pérez/ })
    await user.click(within(ana).getByLabelText('Ausente'))
    await user.type(within(ana).getByLabelText('Observación'), 'Ausente')
    await user.click(screen.getByRole('button', { name: 'Guardar clase' }))

    await waitFor(() => expect(mocks.saveClass).toHaveBeenCalled())
    expect(mocks.saveClass).toHaveBeenCalledWith(12, '2026-09-10', {
      temaDesarrollado: 'Ecuaciones',
      asistencias: [
        { alumnoId: 13, presente: true, justificado: false, observacion: null },
        { alumnoId: 22, presente: false, justificado: false, observacion: 'Ausente' },
      ],
    })
    expect(within(lucia).getByLabelText('Presente')).toBeChecked()
  })

  it('clears justification when an absent student is marked present again', async () => {
    const user = userEvent.setup()
    renderRegister()
    fillNewClass()
    const ana = screen.getByRole('group', { name: /Ana Pérez/ })
    await user.click(within(ana).getByLabelText('Ausente'))
    await user.click(within(ana).getByLabelText('Ausencia justificada'))
    await user.click(within(ana).getByLabelText('Presente'))
    await user.click(screen.getByRole('button', { name: 'Guardar clase' }))

    await waitFor(() => expect(mocks.saveClass).toHaveBeenCalled())
    expect(mocks.saveClass.mock.calls[0][2].asistencias[1]).toEqual({
      alumnoId: 22,
      presente: true,
      justificado: false,
      observacion: null,
    })
  })

  it('shows an accessible empty roster state and never saves an empty attendance payload', async () => {
    const user = userEvent.setup()
    renderRegister({ classes: [existingClass], students: [] })

    expect(screen.getByText('Ecuaciones')).toBeInTheDocument()
    expect(screen.getByText('No hay alumnos inscriptos')).toHaveAttribute('role', 'status')
    expect(screen.queryByRole('button', { name: 'Guardar clase' })).not.toBeInTheDocument()

    const date = screen.getByLabelText('Fecha de clase')
    const topic = screen.getByLabelText('Tema desarrollado')
    fireEvent.update(date, '2026-09-10')
    fireEvent.update(topic, 'Ecuaciones')
    await user.click(screen.getByRole('button', { name: 'Nueva fecha' }))

    expect(mocks.saveClass).not.toHaveBeenCalled()
    expect(screen.getByText('Ecuaciones')).toBeInTheDocument()
  })

  it('locks draft, date and history controls until save refreshes history and detail', async () => {
    const user = userEvent.setup()
    let resolveHistory!: (value: ClassSummary[]) => void
    let resolveDetail!: (value: ClassRecord) => void
    mocks.listClasses.mockReturnValueOnce(new Promise<ClassSummary[]>(resolve => { resolveHistory = resolve }))
    mocks.getClass.mockReturnValueOnce(new Promise<ClassRecord>(resolve => { resolveDetail = resolve }))
    renderRegister()
    fillNewClass()

    await user.click(screen.getByRole('button', { name: 'Guardar clase' }))
    await waitFor(() => expect(mocks.saveClass).toHaveBeenCalled())

    expect(screen.getByLabelText('Fecha de clase')).toBeDisabled()
    expect(screen.getByLabelText('Tema desarrollado')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Nueva fecha' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled()
    expect(screen.getByRole('group', { name: /Lucia Test/ }).querySelector('input[type="radio"]')).toBeDisabled()

    resolveHistory([{ ...existingClass, fecha: '2026-09-10' }])
    await waitFor(() => expect(mocks.getClass).toHaveBeenCalledWith(12, '2026-09-10'))
    expect(screen.getByRole('button', { name: 'Abrir 2026-09-10' })).toBeDisabled()
    expect(screen.getByLabelText('Tema desarrollado')).toHaveValue('Ecuaciones')

    resolveDetail({ ...existingDetail, fecha: '2026-09-10' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar clase' })).not.toBeDisabled())
  })

  it('renders only persisted attendance rows for a historical detail', async () => {
    const withdrawnStudent: EnrolledStudent = { alumnoId: 44, apellidoNombre: 'Alumno dado de baja', dni: 30999888, email: 'baja@example.test' }
    const currentOnlyStudent: EnrolledStudent = { alumnoId: 13, apellidoNombre: 'Alumno activo actual', dni: 40111222, email: 'activo@example.test' }
    const historicalCourse = { ...activeCourse, anioLectivo: activeCourse.anioLectivo - 1, editable: false }
    const historicalRecord: ClassRecord = {
      fecha: existingClass.fecha,
      temaDesarrollado: 'Introducción histórica',
      asistencias: [{ alumnoId: withdrawnStudent.alumnoId, nombre: withdrawnStudent.apellidoNombre, dni: withdrawnStudent.dni, presente: false, justificado: true, observacion: 'Baja posterior' }],
    }
    mocks.getClass.mockResolvedValue(historicalRecord)
    const user = userEvent.setup()
    renderRegister({ course: historicalCourse, students: [currentOnlyStudent], classes: [existingClass] })

    await user.click(screen.getByRole('button', { name: 'Abrir 2026-09-08' }))
    await waitFor(() => expect(screen.getByRole('group', { name: /Alumno dado de baja/ })).toBeInTheDocument())

    const historicalGroup = screen.getByRole('group', { name: /Alumno dado de baja/ })
    expect(historicalGroup).toHaveTextContent('DNI 30999888')
    expect(screen.queryByRole('group', { name: /Alumno activo actual/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('group')).toHaveLength(1)
  })

  it('loads the history and precarga all attendance fields for an existing date', async () => {
    mocks.getClass.mockResolvedValue(existingDetail)
    const user = userEvent.setup()
    renderRegister({ classes: [existingClass] })

    expect(screen.getByText('Ecuaciones')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Abrir 2026-09-08' }))

    await waitFor(() => expect(mocks.getClass).toHaveBeenCalledWith(12, '2026-09-08'))
    expect(screen.getByLabelText('Tema desarrollado')).toHaveValue('Ecuaciones')
    expect(within(screen.getByRole('group', { name: /Lucia Test/ })).getByLabelText('Presente')).toBeChecked()
    expect(within(screen.getByRole('group', { name: /Ana Pérez/ })).getByLabelText('Ausente')).toBeChecked()
    expect(within(screen.getByRole('group', { name: /Ana Pérez/ })).getByLabelText('Ausencia justificada')).toBeChecked()
    expect(within(screen.getByRole('group', { name: /Ana Pérez/ })).getByLabelText('Observación')).toHaveValue('Turno médico')
    expect(screen.getByText(/1 presente.*1 ausente.*1 ausencia justificada/i)).toBeInTheDocument()
  })

  it('preserves edited values after a save error and allows retry', async () => {
    const user = userEvent.setup()
    mocks.saveClass.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ fecha: '2026-09-10', temaDesarrollado: 'Ecuaciones', registros: 2 })
    mocks.getClass.mockResolvedValue(existingDetail)
    renderRegister()
    fillNewClass()
    const ana = screen.getByRole('group', { name: /Ana Pérez/ })
    await user.click(within(ana).getByLabelText('Ausente'))
    await user.type(within(ana).getByLabelText('Observación'), 'Conservar')

    await user.click(screen.getByRole('button', { name: 'Guardar clase' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/no pudimos guardar/i)
    expect(screen.getByLabelText('Fecha de clase')).toHaveValue('2026-09-10')
    expect(screen.getByLabelText('Tema desarrollado')).toHaveValue('Ecuaciones')
    expect(within(ana).getByLabelText('Ausente')).toBeChecked()
    expect(within(ana).getByLabelText('Observación')).toHaveValue('Conservar')

    await user.click(screen.getByRole('button', { name: 'Guardar clase' }))
    await waitFor(() => expect(mocks.saveClass).toHaveBeenCalledTimes(2))
    expect(mocks.listClasses).toHaveBeenCalled()
    expect(mocks.getClass).toHaveBeenCalledWith(12, '2026-09-10')
  })

  it('keeps historical classes consultable but disables every editing control and delete is absent', async () => {
    mocks.getClass.mockResolvedValue(existingDetail)
    const user = userEvent.setup()
    renderRegister({
      course: { ...activeCourse, anioLectivo: activeCourse.anioLectivo - 1, editable: false },
      classes: [existingClass],
    })

    await user.click(screen.getByRole('button', { name: 'Abrir 2026-09-08' }))
    await waitFor(() => expect(mocks.getClass).toHaveBeenCalled())
    expect(screen.getByLabelText('Fecha de clase')).toBeDisabled()
    expect(screen.getByLabelText('Tema desarrollado')).toBeDisabled()
    const historicalGroup = screen.getByRole('group', { name: /Ana Pérez/ })
    expect(historicalGroup.querySelector('input[type="radio"]')).toBeDisabled()
    expect(within(historicalGroup).getByLabelText('Ausencia justificada')).toBeDisabled()
    expect(within(historicalGroup).getByLabelText('Observación')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Guardar clase' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Eliminar/i })).not.toBeInTheDocument()
  })

  it('discards stale detail responses when the teacher changes date quickly', async () => {
    const user = userEvent.setup()
    let resolveFirst!: (record: ClassRecord) => void
    const first = new Promise<ClassRecord>(resolve => { resolveFirst = resolve })
    mocks.getClass.mockReturnValueOnce(first).mockResolvedValueOnce({ ...existingDetail, fecha: '2026-09-09', temaDesarrollado: 'Funciones' })
    renderRegister({ classes: [existingClass, { ...existingClass, fecha: '2026-09-09', temaDesarrollado: 'Funciones' }] })

    await user.click(screen.getByRole('button', { name: 'Abrir 2026-09-08' }))
    await user.click(screen.getByRole('button', { name: 'Abrir 2026-09-09' }))
    await waitFor(() => expect(screen.getByLabelText('Tema desarrollado')).toHaveValue('Funciones'))
    resolveFirst(existingDetail)

    await waitFor(() => expect(screen.getByText(/Solicitudes obsoletas descartadas: 1/)).toBeInTheDocument())
    expect(screen.getByLabelText('Tema desarrollado')).toHaveValue('Funciones')
  })
})
