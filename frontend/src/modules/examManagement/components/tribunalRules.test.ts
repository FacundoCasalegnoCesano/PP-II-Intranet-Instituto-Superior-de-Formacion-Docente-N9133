import { describe, expect, it } from 'vitest'
import { isTribunalComplete } from '../tribunalRules'
import type { TribunalMember } from '../types/exams'

const member = (profesorId: number, rolTribunal: TribunalMember['rolTribunal']): TribunalMember => ({
  profesorId,
  apellidoNombre: `Docente ${profesorId}`,
  rolTribunal,
})

describe('tribunalRules', () => {
  it('requires exactly one president, two vocales, at most one suplente and unique professors', () => {
    expect(isTribunalComplete([
      member(1, 'PRESIDENTE'),
      member(2, 'VOCAL'),
      member(3, 'VOCAL'),
    ])).toBe(true)
    expect(isTribunalComplete([
      member(1, 'PRESIDENTE'),
      member(2, 'VOCAL'),
      member(3, 'VOCAL'),
      member(4, 'SUPLENTE'),
    ])).toBe(true)
    expect(isTribunalComplete([
      member(1, 'PRESIDENTE'),
      member(2, 'VOCAL'),
      member(3, 'VOCAL'),
      member(4, 'SUPLENTE'),
      member(5, 'SUPLENTE'),
    ])).toBe(false)
    expect(isTribunalComplete([
      member(1, 'PRESIDENTE'),
      member(2, 'VOCAL'),
      member(2, 'VOCAL'),
    ])).toBe(false)
    expect(isTribunalComplete([
      member(1, 'PRESIDENTE'),
      member(2, 'VOCAL'),
      member(3, 'VOCAL'),
      { ...member(4, 'SUPLENTE'), rolTribunal: 'OTRO' as TribunalMember['rolTribunal'] },
    ])).toBe(false)
  })
})
