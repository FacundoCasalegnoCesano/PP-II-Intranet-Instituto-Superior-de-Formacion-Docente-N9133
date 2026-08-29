import type { ApiErrorPayload } from './contracts'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly field?: string,
    readonly rolesDisponibles?: string[],
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function apiErrorFromPayload(status: number, payload: ApiErrorPayload): ApiError {
  return new ApiError(payload.message, status, payload.code, payload.field, payload.rolesDisponibles)
}

export function normalizeApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error

  if (error instanceof TypeError) {
    return new ApiError('No se pudo conectar con el servidor', 0, 'NETWORK_ERROR')
  }

  return new ApiError('Ocurrió un error inesperado', 0, 'UNKNOWN_ERROR')
}
