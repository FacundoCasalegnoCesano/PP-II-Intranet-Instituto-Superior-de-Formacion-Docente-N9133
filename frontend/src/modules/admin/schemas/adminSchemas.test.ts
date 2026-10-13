import { describe, expect, it } from 'vitest'
import { adminUserCreateSchema, adminUserSchema, courseSchema, subjectSchema } from './adminSchemas'

const common = {
  apellidoNombre: 'Ada Lovelace',
  dni: '12345678',
  email: 'ada@example.test',
  fechaNacimiento: '1815-12-10',
  telefono: '1234567890',
  password: 'Temporal!9',
  passwordConfirm: 'Temporal!9',
}

describe('admin user schemas', () => {
  it('requires the backend registration fields for a new account', () => {
    expect(adminUserCreateSchema.safeParse({ ...common, role: 'PROFESOR' }).success).toBe(false)
    expect(adminUserCreateSchema.safeParse({ ...common, role: 'PROFESOR', cuil: '20123456789' }).success).toBe(true)
  })

  it('requires the student profile only when creating an ALUMNO', () => {
    const base = { ...common, role: 'ALUMNO', cuil: '20123456789' }
    expect(adminUserCreateSchema.safeParse(base).success).toBe(false)
    expect(adminUserCreateSchema.safeParse({ ...base, domicilio: 'Centro 123', anioEgreso: 2020 }).success).toBe(true)
  })

  it('allows an empty CUIL on edits so omitted values are not sent', () => {
    expect(adminUserSchema.safeParse({ ...common, cuil: '' }).success).toBe(true)
  })
})

describe('subject schema', () => {
  const validSubject = {
    nombre: 'Didáctica General',
    carreraId: 3,
    cursoAnio: 2,
    cargaHoraria: 64,
    tipoEspacio: 'MATERIA',
  }

  it('preserves selected prerequisite ids', () => {
    expect(subjectSchema.parse({ ...validSubject, correlativasIds: [3, 4] }).correlativasIds).toEqual([3, 4])
  })

  it('rejects duplicate prerequisite ids', () => {
    expect(() => subjectSchema.parse({ ...validSubject, correlativasIds: [3, 3] })).toThrow()
  })
})

describe('course schema', () => {
  it('rejects incomplete or malformed data with actionable Spanish feedback', () => {
    const result = courseSchema.safeParse({ materiaId: 0, anioLectivo: 2026, periodo: 'ANUAL' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['materiaId'])
      expect(result.error.issues[0]?.message).toMatch(/materia/i)
    }
    const malformed = courseSchema.safeParse({ materiaId: 4, anioLectivo: 'año', periodo: '' })
    expect(malformed.success).toBe(false)
    if (!malformed.success) expect(malformed.error.issues.every(({ message }) => !message.includes('Invalid input'))).toBe(true)
  })

  it('accepts an unassigned teacher while keeping one as the minimum subject id', () => {
    expect(courseSchema.safeParse({ materiaId: 1, anioLectivo: 2026, periodo: 'ANUAL', docenteId: null }).success).toBe(true)
    expect(courseSchema.safeParse({ materiaId: 0, anioLectivo: 2026, periodo: 'ANUAL' }).success).toBe(false)
  })
})
