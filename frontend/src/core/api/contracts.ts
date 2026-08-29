export interface ApiSuccess<T> {
  success: true
  message?: string
  data?: T
}

export interface ApiFailure {
  success: false
  message: string
  code?: string
  field?: string
  rolesDisponibles?: string[]
}

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure

export interface ApiErrorPayload {
  message: string
  code?: string
  field?: string
  rolesDisponibles?: string[]
}
