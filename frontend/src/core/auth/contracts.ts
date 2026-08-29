export const ROLES = ['ALUMNO', 'PROFESOR', 'ADMINISTRATIVO'] as const

export type Role = (typeof ROLES)[number]

export interface PublicUser {
  idUsuario: number
  apellidoNombre: string
  dni: number
  email: string
  fechaNacimiento: string
  telefono: string
  cuil?: string | null
  activo: boolean
  rol: string
  contactoEmergencia?: string | null
  foto?: string | null
  ultimoAcceso?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface SessionTokens {
  accessToken: string
  refreshToken: string
}

export interface AuthSession extends SessionTokens {
  sessionId: number
  user: PublicUser
  roles: Role[]
  role?: Role
}

export interface LoginInput {
  identifier: string
  password: string
}

export interface LoginResult extends AuthSession {}

export interface SelectRoleInput {
  role: Role
}

export interface SelectRoleResult extends SessionTokens {
  sessionId: number
  rol: Role
  rolesDisponibles: Role[]
}

export interface RefreshTokenInput {
  refreshToken: string
}

export interface RefreshTokenResult extends SessionTokens {}

export interface ChangePasswordInput {
  currentPassword: string
  newPassword: string
}

export interface ForgotPasswordInput {
  email: string
}

export interface ResetPasswordInput {
  token: string
  newPassword: string
}

export interface VerifyResetTokenResult {
  valid: boolean
  email?: string
}
