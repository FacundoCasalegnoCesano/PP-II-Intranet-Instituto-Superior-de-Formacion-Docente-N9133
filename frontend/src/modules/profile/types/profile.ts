import type { PublicUser } from '@/core/auth/contracts'

export interface OwnProfile extends PublicUser {
  roles: string[]
}

export interface OwnProfileInput {
  apellidoNombre: string
  dni: string
  email: string
  fechaNacimiento: string
  telefono: string
  cuil?: string | null
  contactoEmergencia?: string | null
  foto?: string | null
}

export interface ChangeOwnPasswordInput {
  currentPassword: string
  newPassword: string
}
