import { z } from 'zod'

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Ingresá tu correo electrónico o DNI.'),
  password: z.string().min(1, 'Ingresá tu contraseña.'),
})

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Ingresá un correo electrónico válido.'),
})

export const resetPasswordSchema = z.object({
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.'),
  confirmation: z.string().min(1, 'Confirmá la nueva contraseña.'),
}).refine(({ password, confirmation }) => password === confirmation, {
  path: ['confirmation'],
  message: 'Las contraseñas no coinciden.',
})
