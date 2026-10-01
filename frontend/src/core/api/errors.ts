import type { ApiErrorDetail, ApiErrorPayload } from './contracts'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly field?: string,
    readonly rolesDisponibles?: string[],
    readonly details?: ApiErrorDetail[],
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function apiErrorFromPayload(status: number, payload: ApiErrorPayload): ApiError {
  const source = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
  const message = typeof source.message === 'string' && source.message.trim()
    ? source.message.trim()
    : 'Ocurrió un error inesperado'
  const details = Array.isArray(source.errors)
    ? source.errors.flatMap((detail): ApiErrorDetail[] => {
      if (!detail || typeof detail !== 'object' || typeof (detail as Record<string, unknown>).message !== 'string') return []
      const detailMessage = ((detail as Record<string, unknown>).message as string).trim()
      if (!detailMessage) return []
      const field = (detail as Record<string, unknown>).field
      return [{
        ...(typeof field === 'string' && field.trim()
          ? { field: field.trim() }
          : typeof field === 'number' && Number.isFinite(field) ? { field: String(field) } : {}),
        message: detailMessage,
      }]
    })
    : undefined
  const code = typeof source.code === 'string' && source.code.trim() ? source.code.trim() : undefined
  const field = typeof source.field === 'string' && source.field.trim() ? source.field.trim() : undefined
  const rolesDisponibles = Array.isArray(source.rolesDisponibles)
    ? source.rolesDisponibles.filter((role): role is string => typeof role === 'string' && Boolean(role.trim()))
    : undefined
  return new ApiError(message, status, code, field, rolesDisponibles, details)
}

export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const detail = error.details?.find(({ message }) => typeof message === 'string' && message.trim())
    if (detail) return detail.message.trim()
    const message = error.message.trim()
    if (message && message !== 'Error de validación') return message
  }
  return fallback.trim() || 'Ocurrió un error inesperado'
}

export function normalizeApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error

  if (error instanceof TypeError) {
    return new ApiError('No se pudo conectar con el servidor', 0, 'NETWORK_ERROR')
  }

  return new ApiError('Ocurrió un error inesperado', 0, 'UNKNOWN_ERROR')
}
