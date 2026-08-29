import { z } from 'zod'

const passwordRule = z.string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres.')
  .max(50, 'La contraseña no puede exceder 50 caracteres.')
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/, 'Incluí mayúscula, minúscula, número y carácter especial.')

export const profileSchema = z.object({
  apellidoNombre: z.string().trim().min(1, 'Ingresá tu nombre y apellido.').max(255, 'El nombre y apellido no puede exceder 255 caracteres.'),
  dni: z.string().regex(/^\d{7,8}$/, 'El DNI debe tener entre 7 y 8 dígitos.'),
  email: z.string().trim().email('Ingresá un correo electrónico válido.').max(255, 'El email no puede exceder 255 caracteres.'),
  fechaNacimiento: z.string().refine((value) => !Number.isNaN(Date.parse(value)) && new Date(value) <= new Date(), 'La fecha de nacimiento no puede ser futura.'),
  telefono: z.string().regex(/^\d{10,11}$/, 'El teléfono debe tener entre 10 y 11 dígitos.'),
  cuil: z.string().regex(/^\d{11}$/, 'El CUIL debe tener 11 dígitos.').or(z.literal('')),
  contactoEmergencia: z.string().max(255, 'El contacto de emergencia no puede exceder 255 caracteres.'),
  foto: z.string().max(255, 'La ruta o URL de la foto no puede exceder 255 caracteres.'),
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Ingresá tu contraseña actual.'),
  newPassword: passwordRule,
  confirmation: z.string().min(1, 'Confirmá la nueva contraseña.'),
}).refine(({ newPassword, confirmation }) => newPassword === confirmation, {
  path: ['confirmation'],
  message: 'Las contraseñas no coinciden.',
})
