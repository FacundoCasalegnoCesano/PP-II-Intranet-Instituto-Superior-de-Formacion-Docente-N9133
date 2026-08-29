import { describe, expect, it } from 'vitest'
import { changePasswordSchema, profileSchema } from './profileSchemas'

describe('profile validation', () => {
  it('matches backend field rules for identity and contact data', () => {
    expect(profileSchema.safeParse({ apellidoNombre: 'Lucía Test', dni: '42666888', email: 'lucia@example.test', fechaNacimiento: '2000-01-01', telefono: '3624000000', cuil: '27426668880', contactoEmergencia: '', foto: '/foto.jpg' }).success).toBe(true)
    expect(profileSchema.safeParse({ apellidoNombre: 'Lucía', dni: '123', email: 'invalido', fechaNacimiento: '2999-01-01', telefono: '12', cuil: '1' }).success).toBe(false)
  })

  it('requires a strong confirmation-matched new password', () => {
    expect(changePasswordSchema.safeParse({ currentPassword: 'Actual1!', newPassword: 'Nueva12!', confirmation: 'Nueva12!' }).success).toBe(true)
    expect(changePasswordSchema.safeParse({ currentPassword: 'Actual1!', newPassword: 'corta', confirmation: 'distinta' }).success).toBe(false)
  })
})
