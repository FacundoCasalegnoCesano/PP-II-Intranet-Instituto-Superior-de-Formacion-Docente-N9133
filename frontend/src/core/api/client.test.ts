import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthSession } from '@/core/auth/contracts'
import { SessionStorage } from '@/core/storage/sessionStorage'
import { ApiClient } from './client'
import type { ApiSuccess } from './contracts'
import { ApiError, normalizeApiError } from './errors'

const session: AuthSession = {
  accessToken: 'expired-access',
  refreshToken: 'refresh-token',
  sessionId: 17,
  user: {
    idUsuario: 4,
    apellidoNombre: 'Ada Lovelace',
    dni: 12345678,
    email: 'ada@example.test',
    fechaNacimiento: '1815-12-10',
    telefono: '1234567890',
    activo: true,
    rol: 'ALUMNO',
  },
  roles: ['ALUMNO'],
  role: 'ALUMNO',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function client(fetcher: typeof fetch) {
  const storage = new SessionStorage()
  storage.save(session)
  return { api: new ApiClient({ baseUrl: '/api', fetcher, storage }), storage }
}

afterEach(() => {
  window.sessionStorage.clear()
  vi.unstubAllGlobals()
})

describe('ApiClient', () => {
  it('normalizes network and invalid JSON failures to ApiError', async () => {
    const networkError = normalizeApiError(new TypeError('Failed to fetch'))
    expect(networkError).toMatchObject({ status: 0, code: 'NETWORK_ERROR' })

    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('<html>Unavailable</html>', { status: 502 }),
    )
    const { api } = client(fetcher)

    await expect(api.get('/health', { auth: false })).rejects.toMatchObject({
      status: 502,
      code: 'INVALID_RESPONSE',
    } satisfies Partial<ApiError>)
  })

  it('invokes the browser fetch implementation with the global receiver', async () => {
    let receiver: unknown
    const fetcher: typeof fetch = function (this: unknown) {
      receiver = this
      return Promise.resolve(jsonResponse({ success: true, data: { status: 'OK' } }))
    }
    const { api } = client(fetcher)

    await api.get('/health', { auth: false })

    expect(receiver).toBe(globalThis)
  })

  it('uses a Bearer token only for authenticated requests', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { status: 'OK' } }))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { status: 'OK' } }))
    const { api } = client(fetcher)

    await api.get('/me')
    await api.post('/auth/login', { identifier: 'ada', password: 'secret' })

    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe('Bearer expired-access')
    expect(new Headers(fetcher.mock.calls[1]?.[1]?.headers).get('Authorization')).toBeNull()
  })

  it('unwraps a successful forgot-password response without data', async () => {
    const response: ApiSuccess<undefined> = {
      success: true,
      message: 'Si el correo existe, recibirás instrucciones.',
    }
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(response))
    const { api } = client(fetcher)

    await expect(api.post<void>('/auth/forgot-password', { email: 'ada@example.test' })).resolves.toBeUndefined()
  })

  it('preserves pagination only through the explicit paginated helper and supports delete', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        data: [{ id: 1 }],
        pagination: { page: 2, limit: 10, total: 11, totalPages: 2 },
      }))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { removed: true } }))
    const { api } = client(fetcher)

    await expect(api.getPaginated<{ id: number }>('/users?page=2')).resolves.toEqual({
      data: [{ id: 1 }],
      pagination: { page: 2, limit: 10, total: 11, totalPages: 2 },
    })
    await expect(api.delete<{ removed: boolean }>('/users/1')).resolves.toEqual({ removed: true })
    expect(fetcher.mock.calls[1]?.[1]?.method).toBe('DELETE')
  })

  it('refreshes once after a 401 and retries the original request with rotated tokens', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ success: false, message: 'Token expirado' }, 401))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { accessToken: 'fresh-access', refreshToken: 'fresh-refresh' } }))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { id: 1 } }))
    const { api, storage } = client(fetcher)

    await expect(api.get('/protected')).resolves.toEqual({ id: 1 })

    expect(fetcher.mock.calls).toHaveLength(3)
    expect(fetcher.mock.calls[1]?.[0]).toBe('/api/auth/refresh-token')
    expect(new Headers(fetcher.mock.calls[2]?.[1]?.headers).get('Authorization')).toBe('Bearer fresh-access')
    expect(storage.read()).toMatchObject({ accessToken: 'fresh-access', refreshToken: 'fresh-refresh' })
  })

  it('shares one refresh operation among concurrent 401 responses', async () => {
    let resolveRefresh: ((response: Response) => void) | undefined
    const refresh = new Promise<Response>((resolve) => {
      resolveRefresh = resolve
    })
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ success: false, message: 'Expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({ success: false, message: 'Expired' }, 401))
      .mockImplementationOnce(() => refresh)
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { first: true } }))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { second: true } }))
    const { api } = client(fetcher)

    const first = api.get('/first')
    const second = api.get('/second')
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3))
    resolveRefresh?.(jsonResponse({ success: true, data: { accessToken: 'fresh-access', refreshToken: 'fresh-refresh' } }))

    await expect(Promise.all([first, second])).resolves.toEqual([{ first: true }, { second: true }])
    expect(fetcher.mock.calls.filter(([url]) => url === '/api/auth/refresh-token')).toHaveLength(1)
  })

  it('propagates 403 without refreshing or clearing the session', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ success: false, message: 'Sin permiso', code: 'ROLE_REQUIRED' }, 403),
    )
    const { api, storage } = client(fetcher)

    await expect(api.get('/protected')).rejects.toMatchObject({ status: 403, code: 'ROLE_REQUIRED' })

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(storage.read()).toEqual(session)
  })

  it('notifies the registered session handler after a final 401, but not for a 403', async () => {
    const onSessionInvalidated = vi.fn()
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ success: false, message: 'Token expirado' }, 401))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { accessToken: 'fresh-access', refreshToken: 'fresh-refresh' } }))
      .mockResolvedValueOnce(jsonResponse({ success: false, message: 'Token revocado' }, 401))
      .mockResolvedValueOnce(jsonResponse({ success: false, message: 'Sin permiso' }, 403))
    const { api, storage } = client(fetcher)

    api.setSessionInvalidationHandler(onSessionInvalidated)

    await expect(api.get('/protected')).rejects.toMatchObject({ status: 401 })
    expect(onSessionInvalidated).toHaveBeenCalledTimes(1)
    expect(storage.read()).toBeNull()

    storage.save(session)
    await expect(api.get('/protected')).rejects.toMatchObject({ status: 403 })
    expect(onSessionInvalidated).toHaveBeenCalledTimes(1)
    expect(storage.read()).toEqual(session)
  })

  it('clears the complete session when refresh fails', async () => {
    const onSessionInvalidated = vi.fn()
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ success: false, message: 'Token expirado' }, 401))
      .mockResolvedValueOnce(jsonResponse({ success: false, message: 'Refresh inv\u00e1lido' }, 401))
    const { api, storage } = client(fetcher)
    api.setSessionInvalidationHandler(onSessionInvalidated)

    await expect(api.get('/protected')).rejects.toMatchObject({ status: 401, message: 'Refresh inv\u00e1lido' })
    expect(storage.read()).toBeNull()
    expect(onSessionInvalidated).toHaveBeenCalledTimes(1)
  })
})
