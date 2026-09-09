import type { SessionTokens } from '@/core/auth/contracts'
import { SessionStorage, sessionStorage } from '@/core/storage/sessionStorage'
import type { ApiEnvelope, ApiErrorPayload, PaginatedResult } from './contracts'
import { ApiError, apiErrorFromPayload, normalizeApiError } from './errors'

export interface ApiRequestOptions extends Omit<RequestInit, 'body' | 'headers'> {
  auth?: boolean
  body?: unknown
  headers?: HeadersInit
  preservePagination?: boolean
}

export interface ApiClientOptions {
  baseUrl?: string
  fetcher?: typeof fetch
  storage?: SessionStorage
}

const PUBLIC_AUTH_PATHS = [
  '/auth/login',
  '/auth/refresh-token',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/verify-reset-token',
  '/auth/admin/backup-code',
] as const

function isPublicAuthPath(path: string): boolean {
  return PUBLIC_AUTH_PATHS.some((publicPath) => path === publicPath || path.startsWith(`${publicPath}/`))
}

function isApiEnvelope(value: unknown): value is ApiEnvelope<unknown> {
  return !!value
    && typeof value === 'object'
    && 'success' in value
    && typeof value.success === 'boolean'
}

function errorFromStatus(status: number, statusText: string): ApiError {
  return new ApiError(statusText || 'La solicitud no pudo completarse', status, 'HTTP_ERROR')
}

export class ApiClient {
  private readonly baseUrl: string
  private readonly fetcher: typeof fetch
  private readonly storage: SessionStorage
  private refreshPromise: Promise<SessionTokens> | undefined
  private sessionInvalidationHandler: (() => void) | undefined

  constructor({
    baseUrl = import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_URL ?? '/api',
    fetcher = fetch,
    storage = sessionStorage,
  }: ApiClientOptions = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.fetcher = fetcher
    this.storage = storage
  }

  get<T>(path: string, options: Omit<ApiRequestOptions, 'method' | 'body'> = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' })
  }

  getBlob(path: string, options: Omit<ApiRequestOptions, 'method' | 'body'> = {}): Promise<Blob> {
    return this.requestBlobOnce(path, { ...options, method: 'GET' }, false)
  }

  post<T>(path: string, body?: unknown, options: Omit<ApiRequestOptions, 'method' | 'body'> = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'POST', body })
  }

  put<T>(path: string, body?: unknown, options: Omit<ApiRequestOptions, 'method' | 'body'> = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PUT', body })
  }

  delete<T = void>(path: string, options: Omit<ApiRequestOptions, 'method' | 'body'> = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' })
  }

  getPaginated<T>(path: string, options: Omit<ApiRequestOptions, 'method' | 'body'> = {}): Promise<PaginatedResult<T>> {
    return this.request<PaginatedResult<T>>(path, { ...options, method: 'GET', preservePagination: true })
  }

  request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    return this.requestOnce<T>(path, options, false)
  }

  setSessionInvalidationHandler(handler: (() => void) | undefined): void {
    this.sessionInvalidationHandler = handler
  }

  private async requestOnce<T>(path: string, options: ApiRequestOptions, retried: boolean): Promise<T> {
    const useAuth = options.auth ?? !isPublicAuthPath(path)
    const response = await this.send(path, options, useAuth)

    if (response.status === 401 && useAuth && !retried) {
      try {
        await this.refreshSession()
      } catch (error) {
        throw normalizeApiError(error)
      }

      return this.requestOnce<T>(path, options, true)
    }

    try {
      return await this.unwrap<T>(response, options.preservePagination)
    } catch (error) {
      const normalized = normalizeApiError(error)
      if (normalized.status === 401 && useAuth) this.invalidateSession()
      throw normalized
    }
  }

  private async requestBlobOnce(path: string, options: ApiRequestOptions, retried: boolean): Promise<Blob> {
    const useAuth = options.auth ?? !isPublicAuthPath(path)
    const response = await this.send(path, options, useAuth)

    if (response.status === 401 && useAuth && !retried) {
      try {
        await this.refreshSession()
      } catch (error) {
        throw normalizeApiError(error)
      }
      return this.requestBlobOnce(path, options, true)
    }

    if (!response.ok) {
      try {
        await this.unwrap(response)
      } catch (error) {
        const normalized = normalizeApiError(error)
        if (normalized.status === 401 && useAuth) this.invalidateSession()
        throw normalized
      }
    }

    return response.blob()
  }

  private async send(path: string, options: ApiRequestOptions, useAuth: boolean): Promise<Response> {
    const headers = new Headers(options.headers)
    const { auth: _auth, body, headers: _headers, preservePagination: _preservePagination, ...requestOptions } = options

    if (useAuth) {
      const accessToken = this.storage.read()?.accessToken
      if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
    }

    let requestBody: BodyInit | undefined
    if (body instanceof FormData) {
      headers.delete('Content-Type')
      requestBody = body
    } else if (body !== undefined) {
      headers.set('Content-Type', headers.get('Content-Type') ?? 'application/json')
      requestBody = JSON.stringify(body)
    }

    try {
      // `window.fetch` validates its receiver. Calling it as `this.fetcher(...)`
      // binds the ApiClient instance and causes "Illegal invocation" in browsers.
      return await this.fetcher.call(globalThis, this.url(path), { ...requestOptions, headers, body: requestBody })
    } catch (error) {
      throw normalizeApiError(error)
    }
  }

  private async refreshSession(): Promise<SessionTokens> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.refreshSessionOnce().finally(() => {
        this.refreshPromise = undefined
      })
    }

    return this.refreshPromise
  }

  private async refreshSessionOnce(): Promise<SessionTokens> {
    const refreshToken = this.storage.read()?.refreshToken
    if (!refreshToken) {
      this.invalidateSession()
      throw new ApiError('La sesión expiró', 401, 'SESSION_EXPIRED')
    }

    try {
      const response = await this.send('/auth/refresh-token', {
        method: 'POST',
        auth: false,
        body: { refreshToken },
      }, false)
      const tokens = await this.unwrap<SessionTokens>(response)

      if (typeof tokens.accessToken !== 'string' || typeof tokens.refreshToken !== 'string') {
        throw new ApiError('La respuesta de renovación es inválida', response.status, 'INVALID_RESPONSE')
      }

      this.storage.updateTokens(tokens)
      return tokens
    } catch (error) {
      this.invalidateSession()
      throw normalizeApiError(error)
    }
  }

  private invalidateSession(): void {
    this.storage.clear()
    this.sessionInvalidationHandler?.()
  }

  private async unwrap<T>(response: Response, preservePagination = false): Promise<T> {
    const text = await response.text()
    let payload: unknown

    try {
      payload = JSON.parse(text)
    } catch {
      throw new ApiError('El servidor devolvió una respuesta inválida', response.status, 'INVALID_RESPONSE')
    }

    if (!isApiEnvelope(payload)) {
      throw new ApiError('El servidor devolvió una respuesta inválida', response.status, 'INVALID_RESPONSE')
    }

    if (!response.ok) {
      if (!payload.success) throw apiErrorFromPayload(response.status, payload as ApiErrorPayload)
      throw errorFromStatus(response.status, response.statusText)
    }

    if (!payload.success) throw apiErrorFromPayload(response.status, payload as ApiErrorPayload)
    if (preservePagination && 'pagination' in payload && payload.pagination) {
      return { data: Array.isArray(payload.data) ? payload.data : [], pagination: payload.pagination } as T
    }
    return ('data' in payload ? payload.data : undefined) as T
  }

  private url(path: string): string {
    return `${this.baseUrl}/${path.replace(/^\//, '')}`
  }
}

export const apiClient = new ApiClient()
