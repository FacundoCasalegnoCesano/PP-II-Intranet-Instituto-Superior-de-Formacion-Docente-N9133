export interface ApiSuccess<T> {
  success: true
  message?: string
  data?: T
  pagination?: PaginationMeta
}

export interface ApiResponse<T> {
  data: T
  message?: string
}

export interface ApiFailure {
  success: false
  message: string
  code?: string
  field?: string
  rolesDisponibles?: string[]
  errors?: ApiValidationErrorDetail[]
}

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure

export interface ApiValidationErrorDetail {
  field?: string | number
  message: string
}

export type ApiErrorPayload = ApiFailure

export interface ApiErrorDetail {
  field?: string
  message: string
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
