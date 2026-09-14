import { describe, expect, it } from 'vitest'
import { calculatePeriodStatus, formatArgentinaDate, periodDateRange, periodScope, periodTitle } from '../periodsPresentation'

describe('periodsPresentation', () => {
  const base = {
    id: 1,
    tipo: 'MATERIA' as const,
    cicloLectivo: 2026,
    fechaInicio: '2026-09-10T12:00:00.000Z',
    fechaFin: '2026-09-20T21:00:00.000Z',
    activo: true,
    cantidadMaterias: 3,
    cantidadMesas: 0,
    descripcion: null,
    estado: 'ABIERTO' as const,
  }

  it.each([
    ['future', 'PROGRAMADO', '2026-09-10T11:59:59.999Z'],
    ['open', 'ABIERTO', '2026-09-10T12:00:00.000Z'],
    ['finished', 'FINALIZADO', '2026-09-20T21:00:00.001Z'],
  ])('calculates the %s status at the backend boundary', (_, expected, now) => {
    expect(calculatePeriodStatus(base, new Date(now))).toBe(expected)
  })

  it('prioritizes deactivation over dates', () => {
    expect(calculatePeriodStatus({ ...base, activo: false }, new Date('2020-01-01T00:00:00.000Z'))).toBe('DESACTIVADO')
  })

  it('explains the type, cycle, dates, and real scope', () => {
    const exam = { ...base, tipo: 'EXAMEN' as const, cantidadMaterias: 0, cantidadMesas: 8 }
    expect(periodTitle(exam)).toBe('Inscripción a exámenes · Ciclo 2026')
    expect(periodDateRange(exam)).toContain('10/09/2026')
    expect(periodScope(exam)).toBe('8 mesas habilitadas')
    expect(periodScope(base)).toBe('3 materias habilitadas')
  })

  it('formats a mesa date near midnight in the institutional timezone', () => {
    expect(formatArgentinaDate('2026-12-02T02:30:00.000Z')).toBe('01/12/2026')
  })
})
