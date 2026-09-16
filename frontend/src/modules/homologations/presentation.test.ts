import { describe, expect, it } from 'vitest'
import { formatHomologationDate, canApproveHomologation, homologationStateInfo, homologationStateLabel, homologationStateTone, normalizeHomologationReturnTo } from './presentation'
import type { Homologation } from './types/homologations'

function item(overrides: Partial<Homologation> = {}): Homologation {
  return {
    id: 1,
    alumno: { idUsuario: 13, apellidoNombre: 'Lucia Test', dni: '42666888', email: 'lucia@example.test' },
    materia: { id: 14, nombre: 'Álgebra', notaMinima: 6, carrera: { id: 3, nombre: 'Inicial' } },
    tipo: 'PARCIAL',
    estado: 'PENDIENTE',
    calificacion: null,
    notaComplementaria: null,
    observacion: null,
    fecha: '2026-09-10T12:00:00.000Z',
    createdAt: '2026-09-10T12:00:00.000Z',
    updatedAt: '2026-09-10T12:00:00.000Z',
    ...overrides,
  }
}

describe('homologation presentation helpers', () => {
  it('describe la parcial sin nota como pendiente de examen', () => {
    expect(homologationStateLabel(item())).toBe('Pendiente de examen complementario')
    expect(homologationStateTone(item())).toBe('warning')
    expect(homologationStateLabel(item({ estado: 'APROBADA' }))).toBe('Aprobada')
    expect(homologationStateTone(item({ estado: 'RECHAZADA' }))).toBe('danger')
  })

  it('separa el estado oficial de la explicación operativa derivada', () => {
    expect(homologationStateInfo(item({ tipo: 'TOTAL' }))).toMatchObject({
      officialLabel: 'Pendiente',
      operationalLabel: 'Pendiente de confirmación',
      label: 'Pendiente de confirmación',
      tone: 'warning',
    })
    expect(homologationStateLabel(item({ notaComplementaria: 5 }))).toBe('Examen complementario desaprobado')
    expect(homologationStateTone(item({ notaComplementaria: 5 }))).toBe('danger')
    expect(homologationStateLabel(item({ notaComplementaria: 6 }))).toBe('Lista para aprobar')
    expect(homologationStateTone(item({ notaComplementaria: 6 }))).toBe('success')
  })

  it('normaliza sólo retornos internos de homologaciones', () => {
    expect(normalizeHomologationReturnTo('/app/administracion/homologaciones?search=%20Luc%C3%ADa%20&page=2&sort=createdAt'))
      .toBe('/app/administracion/homologaciones?search=Luc%C3%ADa&page=2')
    expect(normalizeHomologationReturnTo('/app/administracion/homologaciones?estado=PENDIENTE#detalle')).toBeNull()
    expect(normalizeHomologationReturnTo('https://evil.example/steal')).toBeNull()
  })

  it('impide aprobar una parcial debajo de notaMinima', () => {
    expect(canApproveHomologation(item({ notaComplementaria: 5 }))).toBe(false)
    expect(canApproveHomologation(item({ notaComplementaria: 6 }))).toBe(true)
    expect(canApproveHomologation(item({ notaComplementaria: 10, estado: 'APROBADA' }))).toBe(false)
    expect(canApproveHomologation(item({ tipo: 'TOTAL' }))).toBe(true)
  })

  it('formatea fechas académicas y conserva mensajes para valores ausentes o inválidos', () => {
    expect(formatHomologationDate('2026-09-10')).toBe('10/9/2026')
    expect(formatHomologationDate(null)).toBe('Sin fecha informada')
    expect(formatHomologationDate('no-es-fecha')).toBe('Fecha inválida')
  })
})
