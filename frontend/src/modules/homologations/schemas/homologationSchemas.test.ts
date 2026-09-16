import { describe, expect, it } from 'vitest'
import { createHomologationSchema } from './homologationSchemas'

const base = { alumnoId: 13, materiaId: 14, observacion: null }

describe('homologation schemas', () => {
  it('exige nota anterior sólo para total', () => {
    expect(createHomologationSchema.safeParse({ ...base, tipoHomologacion: 'TOTAL' }).success).toBe(false)
    expect(createHomologationSchema.safeParse({ ...base, tipoHomologacion: 'TOTAL', calificacion: 8 }).success).toBe(true)
    expect(createHomologationSchema.safeParse({ ...base, tipoHomologacion: 'PARCIAL' }).success).toBe(true)
    expect(createHomologationSchema.safeParse({ ...base, tipoHomologacion: 'PARCIAL', calificacion: null }).success).toBe(true)
  })

  it('valida IDs, notas enteras y observaciones del contrato backend', () => {
    expect(createHomologationSchema.safeParse({ ...base, tipoHomologacion: 'TOTAL', calificacion: 0 }).success).toBe(true)
    expect(createHomologationSchema.safeParse({ ...base, tipoHomologacion: 'TOTAL', calificacion: 10 }).success).toBe(true)
    expect(createHomologationSchema.safeParse({ ...base, tipoHomologacion: 'TOTAL', calificacion: 10.5 }).success).toBe(false)
    expect(createHomologationSchema.safeParse({ ...base, tipoHomologacion: 'TOTAL', calificacion: -1 }).success).toBe(false)
    expect(createHomologationSchema.safeParse({ ...base, tipoHomologacion: 'TOTAL', calificacion: 11 }).success).toBe(false)
    expect(createHomologationSchema.safeParse({ ...base, tipoHomologacion: 'TOTAL', calificacion: null }).success).toBe(false)
    expect(createHomologationSchema.safeParse({ ...base, tipoHomologacion: 'PARCIAL', calificacion: 8 }).success).toBe(false)
    expect(createHomologationSchema.safeParse({ ...base, alumnoId: 0, tipoHomologacion: 'TOTAL', calificacion: 8 }).success).toBe(false)
    expect(createHomologationSchema.safeParse({ ...base, tipoHomologacion: 'TOTAL', calificacion: 8, observacion: 'x'.repeat(2001) }).success).toBe(false)
  })
})
