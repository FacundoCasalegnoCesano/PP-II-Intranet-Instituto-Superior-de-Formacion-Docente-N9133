import { z } from 'zod'

const digits = (min: number, max: number, label: string) => z.string().regex(new RegExp(`^\\d{${min},${max}}$`), `${label} debe tener entre ${min} y ${max} dígitos.`)

const adminUserFields = z.object({
  apellidoNombre: z.string().trim().min(1, 'El nombre es requerido.').max(255),
  dni: digits(7, 8, 'El DNI'),
  email: z.string().trim().email('Ingresá un email válido.'),
  fechaNacimiento: z.string().min(1, 'La fecha de nacimiento es requerida.'),
  telefono: digits(10, 11, 'El teléfono'),
  cuil: z.union([digits(11, 11, 'El CUIL'), z.literal('')]).optional(),
  contactoEmergencia: z.string().max(255).optional(),
  foto: z.string().max(255).optional(),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.').optional(),
  passwordConfirm: z.string().optional(),
  domicilio: z.string().optional(),
  anioEgreso: z.coerce.number().int().min(1990).max(2100).nullable().optional(),
  institucionProcedencia: z.string().max(255).optional(),
})

const validatePasswordConfirmation = (value: z.infer<typeof adminUserFields>, ctx: z.RefinementCtx) => {
  if (value.password && value.password !== value.passwordConfirm) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['passwordConfirm'], message: 'Las contraseñas no coinciden.' })
}

export const adminUserSchema = adminUserFields.superRefine(validatePasswordConfirmation)
export const adminUserCreateSchema = adminUserFields.extend({
  cuil: digits(11, 11, 'El CUIL'),
  role: z.enum(['ALUMNO', 'PROFESOR', 'ADMINISTRATIVO']),
}).superRefine((value, ctx) => {
  validatePasswordConfirmation(value, ctx)
  if (value.role === 'ALUMNO') {
    if (!value.domicilio?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['domicilio'], message: 'El domicilio es requerido para alumnos.' })
    if (value.anioEgreso === null || value.anioEgreso === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['anioEgreso'], message: 'El año de egreso es requerido para alumnos.' })
  }
})

export const careerSchema = z.object({ nombre: z.string().trim().min(1, 'El nombre es requerido.').max(255), duracionAnios: z.coerce.number().int().min(1).max(10) })

const prerequisiteIdsSchema = z.array(z.coerce.number().int().min(1)).superRefine((ids, ctx) => {
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'No podés repetir una correlatividad.' })
})

export const subjectSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es requerido.').max(255),
  carreraId: z.coerce.number().int().min(1),
  cursoAnio: z.coerce.number().int().min(1),
  cargaHoraria: z.coerce.number().int().min(1),
  tipoEspacio: z.string().min(1),
  descripcion: z.string().optional(),
  horasCatedra: z.string().optional(),
  modalidad: z.string().optional(),
  periodo: z.string().optional(),
  regimen: z.string().optional(),
  correlativasIds: prerequisiteIdsSchema.optional(),
})

export const courseSchema = z.object({ materiaId: z.coerce.number().int().min(1), anioLectivo: z.coerce.number().int().min(2000).max(2100), periodo: z.string().min(1), docenteId: z.coerce.number().int().min(1).nullable().optional() })

export const periodSchema = z.object({ tipo: z.literal('MATERIA'), cicloLectivo: z.coerce.number().int().min(2000).max(2100), fechaInicio: z.string().min(1), fechaFin: z.string().min(1), materiasIds: z.array(z.coerce.number().int().min(1)).min(1, 'Seleccioná al menos una materia.'), descripcion: z.string().max(255).optional() }).superRefine((value, ctx) => {
  if (new Date(value.fechaFin) <= new Date(value.fechaInicio)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fechaFin'], message: 'La fecha final debe ser posterior.' })
})
