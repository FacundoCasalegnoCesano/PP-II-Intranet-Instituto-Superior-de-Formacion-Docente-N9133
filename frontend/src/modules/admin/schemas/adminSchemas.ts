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
  }
})

export const careerSchema = z.object({ nombre: z.string().trim().min(1, 'El nombre es requerido.').max(255), duracionAnios: z.coerce.number().int().min(1).max(10) })

export const careerEnrollmentSchema = z.object({
  alumnoId: z.coerce.number().int().min(1, 'Seleccioná un alumno.'),
  carreraId: z.coerce.number().int().min(1, 'Seleccioná una carrera.'),
  anioCohorte: z.union([z.literal(''), z.coerce.number().int().min(1900).max(2100)]).optional(),
})

export const adminPasswordResetSchema = z.object({
  newPassword: z.string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres.')
    .max(50, 'La contraseña no puede superar los 50 caracteres.')
    .regex(/[A-Z]/, 'La contraseña debe incluir al menos una mayúscula.')
    .regex(/[a-z]/, 'La contraseña debe incluir al menos una minúscula.')
    .regex(/\d/, 'La contraseña debe incluir al menos un número.')
    .regex(/[^A-Za-z0-9]/, 'La contraseña debe incluir al menos un carácter especial.'),
  passwordConfirm: z.string(),
}).superRefine((value, ctx) => {
  if (value.newPassword !== value.passwordConfirm) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['passwordConfirm'], message: 'Las contraseñas no coinciden.' })
  }
})

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

export const courseSchema = z.object({
  materiaId: z.coerce.number({ invalid_type_error: 'Seleccioná una materia válida.' }).int('Seleccioná una materia válida.').min(1, 'Seleccioná una materia.'),
  anioLectivo: z.coerce.number({ invalid_type_error: 'Ingresá un año lectivo válido.' }).int('Ingresá un año lectivo válido.').min(2000, 'El año lectivo debe ser 2000 o posterior.').max(2100, 'El año lectivo no puede superar 2100.'),
  periodo: z.string({ required_error: 'Seleccioná un período.', invalid_type_error: 'Seleccioná un período válido.' }).min(1, 'Seleccioná un período.'),
  docenteId: z.union([z.coerce.number({ invalid_type_error: 'Seleccioná un docente válido.' }).int('Seleccioná un docente válido.').min(1, 'Seleccioná un docente válido.'), z.null()]).optional(),
})

export const spaceCourseSchema = z.object({
  anioLectivo: z.coerce.number().int().min(2000, 'El año lectivo debe ser 2000 o posterior.').max(2100, 'El año lectivo no puede superar 2100.'),
  periodo: z.enum(['ANUAL', 'PRIMER_CUATRIMESTRE', 'SEGUNDO_CUATRIMESTRE'], { errorMap: () => ({ message: 'Seleccioná un período válido.' }) }),
})

export const periodSchema = z.object({ tipo: z.enum(['MATERIA', 'EXAMEN']), cicloLectivo: z.coerce.number().int().min(2000).max(2100), fechaInicio: z.string().min(1), fechaFin: z.string().min(1), materiasIds: z.array(z.coerce.number().int().min(1)), cursadasEspaciosIds: z.array(z.coerce.number().int().min(1)).optional().default([]), mesasIds: z.array(z.coerce.number().int().min(1)), descripcion: z.string().max(255).optional() }).superRefine((value, ctx) => {
  if (new Date(value.fechaFin) <= new Date(value.fechaInicio)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fechaFin'], message: 'La fecha final debe ser posterior.' })
  if (value.tipo === 'MATERIA' && value.materiasIds.length === 0 && value.cursadasEspaciosIds.length === 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['materiasIds'], message: 'Seleccioná al menos una materia o espacio curricular.' })
  if (value.tipo === 'EXAMEN' && value.mesasIds.length === 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['mesasIds'], message: 'Seleccioná al menos una mesa de examen.' })
})
