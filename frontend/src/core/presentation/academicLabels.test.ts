import { describe, expect, it } from 'vitest'
import { academicLabel, formatAcademicDate, gradeTypeLabel, roleLabel } from './academicLabels'

describe('academic labels', () => {
  it('translates academic enums and keeps an intelligible fallback', () => {
    expect(academicLabel('TALLER_PRACTICA')).toBe('Taller de Práctica')
    expect(academicLabel('PRIMER_CUATRIMESTRE')).toBe('Primer cuatrimestre')
    expect(gradeTypeLabel('EXAMEN_FINAL', 'CURSADA')).toBe('Instancia integradora')
    expect(roleLabel('ADMINISTRATIVO')).toBe('Administrativo/a')
    expect(academicLabel('VALOR_DESCONOCIDO')).toBe('Valor desconocido')
  })

  it('handles empty values and academic dates', () => {
    expect(academicLabel(null)).toBe('—')
    expect(formatAcademicDate('2026-12-10')).toBe('10/12/2026')
    expect(formatAcademicDate('2026-12-10T00:00:00.000Z')).toBe('10/12/2026')
  })
})
