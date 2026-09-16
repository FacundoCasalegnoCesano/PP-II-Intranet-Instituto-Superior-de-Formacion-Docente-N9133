import { z } from 'zod'

const grade = z.preprocess(
  (value) => value === '' || value === null ? undefined : value,
  z.coerce.number().int('La calificación debe ser un número entero.').min(0).max(10).nullable().optional(),
)

export const createHomologationSchema = z.object({
  alumnoId: z.coerce.number().int().min(1, 'Seleccioná un alumno.'),
  materiaId: z.coerce.number().int().min(1, 'Seleccioná una materia.'),
  tipoHomologacion: z.enum(['TOTAL', 'PARCIAL']),
  calificacion: grade,
  observacion: z.string().max(2000).nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.tipoHomologacion === 'TOTAL' && value.calificacion == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['calificacion'],
      message: 'La nota de la institución anterior es requerida para una homologación total.',
    })
  }
  if (value.tipoHomologacion === 'PARCIAL' && value.calificacion != null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['calificacion'],
      message: 'Una homologación parcial no admite nota definitiva en el alta.',
    })
  }
})

export const homologationSchema = createHomologationSchema
