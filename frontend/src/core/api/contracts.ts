export interface ApiSuccess<T> {
  success: true
  message?: string
  data?: T
  pagination?: PaginationMeta
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

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
  hasNextPage?: boolean
  hasPreviousPage?: boolean
}

export interface PaginatedResult<T> {
  data: T[]
  pagination: PaginationMeta
}
