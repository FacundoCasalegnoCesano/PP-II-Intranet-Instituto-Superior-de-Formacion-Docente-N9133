import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/vue'
import type { Component } from 'vue'
import AcademicSummaryTable from './AcademicSummaryTable.vue'
import type { AcademicSummary } from '../types/teacherCourses'

const summary: AcademicSummary = {
  cursadaId: 12,
  materia: { id: 14, nombre: 'Álgebra y Geometría' },
  anioLectivo: 2026,
  periodo: 'ANUAL',
  alumnos: [
    {
      alumno: { alumnoId: 13, apellidoNombre: 'Lucía Fernández', dni: 42666888 },
      asistencia: { porcentaje: 87.5, requerido: 75, cumpleRegularidad: true },
      parcialesEfectivos: [{ numero: 1, notaOriginal: 4, notaEfectiva: 7, recuperado: true }],
      tps: { cargados: 2, aprobados: 1, porcentaje: 50, requerido: 75, cumple: false },
      promedio: 7,
      notaMinima: 6,
      estado: 'HABILITADO_PROMOCION',
      requisitosPendientes: ['TRABAJOS_PRACTICOS', 'INSTANCIA_INTEGRADORA'],
    },
  ],
}

function renderTable(value: AcademicSummary = summary) {
  return render(AcademicSummaryTable as Component, { props: { summary: value } })
}

describe('AcademicSummaryTable', () => {
  it('renders the backend academic DTO with identity, requirements, effective partials and status text', () => {
    renderTable()

    const row = screen.getByRole('row', { name: /Lucía Fernández/ })
    expect(within(row).getByText('Lucía Fernández')).toBeVisible()
    expect(within(row).getByText('DNI 42666888')).toBeVisible()
    expect(within(row).getByText(/87,5%/)).toBeVisible()
    expect(within(row).getByText(/P1: 4 → 7/)).toBeVisible()
    expect(within(row).getByText(/recuperado/i)).toBeVisible()
    expect(within(row).getByText(/2 cargados · 1 aprobados · 50%/)).toBeVisible()
    expect(within(row).getByText('7')).toBeVisible()
    expect(within(row).getByText('6')).toBeVisible()
    expect(within(row).getByText('Habilitado para promoción')).toBeVisible()
    expect(within(row).getByText(/Trabajos prácticos; Instancia integradora/)).toBeVisible()
  })

  it('uses text and labels in addition to status color and exposes no mutation controls', () => {
    renderTable()

    expect(screen.getByRole('table', { name: /resumen académico/i })).toBeVisible()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    const row = screen.getByRole('row', { name: /Lucía Fernández/ })
    expect(within(row).getByText(/Cumple asistencia/)).toBeVisible()
    expect(within(row).getByText(/No cumple TPs/)).toBeVisible()
  })

  it('shows a meaningful empty state while keeping the summary read-only', () => {
    renderTable({ ...summary, alumnos: [] })

    expect(screen.getByRole('status')).toHaveTextContent('No hay alumnos para resumir.')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
