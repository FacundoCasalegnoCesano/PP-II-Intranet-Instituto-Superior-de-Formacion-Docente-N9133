import { describe, expect, it } from 'vitest'
import { adminUserCreateSchema, adminUserSchema } from './adminSchemas'

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
