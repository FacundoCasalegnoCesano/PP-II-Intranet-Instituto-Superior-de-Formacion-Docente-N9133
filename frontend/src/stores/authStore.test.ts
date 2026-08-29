import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { AuthSession, LoginResult, SelectRoleResult } from '@/core/auth/contracts'
import { ApiError } from '@/core/api/errors'
import { sessionStorage } from '@/core/storage/sessionStorage'

const { post, setSessionInvalidationHandler } = vi.hoisted(() => ({
  post: vi.fn(),
  setSessionInvalidationHandler: vi.fn(),
}))

vi.mock('@/core/api/client', () => ({
  apiClient: { post, setSessionInvalidationHandler },
}))

import { useAuthStore } from './authStore'

const user = {
  idUsuario: 4,
  apellidoNombre: 'Ada Lovelace',
  dni: 12345678,
  email: 'ada@example.test',
  fechaNacimiento: '1815-12-10',
  telefono: '1234567890',
  activo: true,
  rol: 'ALUMNO',
}

function loginResult(roles: string[]): LoginResult {
  return {
    accessToken: 'initial-access',
    refreshToken: 'initial-refresh',
    sessionId: 17,
    user,
    roles: roles as LoginResult['roles'],
  }
}

function selectedRole(role: 'ALUMNO' | 'PROFESOR'): SelectRoleResult {
  return {
    accessToken: `access-${role}`,
    refreshToken: `refresh-${role}`,
    sessionId: 18,
    rol: role,
    rolesDisponibles: ['ALUMNO', 'PROFESOR'],
  }
}

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    sessionStorage.clear()
    post.mockReset()
    setSessionInvalidationHandler.mockReset()
  })

  it('starts anonymous and restores a pending multi-role session without exposing storage', async () => {
    const pending: AuthSession = { ...loginResult(['ALUMNO', 'PROFESOR']) }
    sessionStorage.save(pending)

    const store = useAuthStore()
    await store.restore()

    expect(store.status).toBe('role_pending')
    expect(store.roles).toEqual(['ALUMNO', 'PROFESOR'])
    expect(store.activeRole).toBeUndefined()
  })

  it('automatically selects the only normalized role after login without storing the password', async () => {
    post.mockResolvedValueOnce(loginResult(['alumno', 'DESCONOCIDO']))
    post.mockResolvedValueOnce({
      accessToken: 'role-access',
      refreshToken: 'role-refresh',
      sessionId: 18,
      rol: 'ALUMNO',
      rolesDisponibles: ['ALUMNO', 'DESCONOCIDO'],
    } satisfies SelectRoleResult)

    const store = useAuthStore()
    await store.login({ identifier: 'ada@example.test', password: 'secret-password' })

    expect(store.status).toBe('authenticated')
    expect(store.activeRole).toBe('ALUMNO')
    expect(store.roles).toEqual(['ALUMNO'])
    expect(sessionStorage.read()).toMatchObject({ accessToken: 'role-access', role: 'ALUMNO' })
    expect(JSON.stringify(sessionStorage.read())).not.toContain('secret-password')
  })

  it('keeps a multi-role login pending and lets the user select a role manually', async () => {
    post.mockResolvedValueOnce(loginResult(['ALUMNO', 'PROFESOR']))
    post.mockResolvedValueOnce(selectedRole('PROFESOR'))

    const store = useAuthStore()
    await store.login({ identifier: 'ada@example.test', password: 'secret-password' })
    await store.selectRole('PROFESOR')

    expect(store.status).toBe('authenticated')
    expect(store.activeRole).toBe('PROFESOR')
    expect(sessionStorage.read()).toMatchObject({
      accessToken: 'access-PROFESOR',
      sessionId: 18,
      role: 'PROFESOR',
    })
  })

  it('rotates the active role of an authenticated multi-role session', async () => {
    const active: AuthSession = { ...loginResult(['ALUMNO', 'PROFESOR']), role: 'ALUMNO' }
    sessionStorage.save(active)
    post.mockResolvedValueOnce(selectedRole('PROFESOR'))

    const store = useAuthStore()
    await store.restore()
    await store.selectRole('PROFESOR')

    expect(store.activeRole).toBe('PROFESOR')
    expect(store.status).toBe('authenticated')
  })

  it('keeps a valid local session when a role change is forbidden', async () => {
    const active: AuthSession = { ...loginResult(['ALUMNO', 'PROFESOR']), role: 'ALUMNO' }
    sessionStorage.save(active)
    post.mockRejectedValueOnce(new ApiError('Sin permiso', 403, 'ROLE_REQUIRED'))

    const store = useAuthStore()
    await store.restore()

    await expect(store.selectRole('PROFESOR')).rejects.toMatchObject({ status: 403 })
    expect(store.status).toBe('authenticated')
    expect(store.activeRole).toBe('ALUMNO')
    expect(sessionStorage.read()).toEqual(active)
  })

  it('always clears its local session when backend logout fails', async () => {
    const active: AuthSession = { ...loginResult(['ALUMNO']), role: 'ALUMNO' }
    sessionStorage.save(active)
    post.mockRejectedValueOnce(new Error('network unavailable'))

    const store = useAuthStore()
    await store.restore()

    await expect(store.logout()).rejects.toThrow('network unavailable')
    expect(store.status).toBe('anonymous')
    expect(sessionStorage.read()).toBeNull()
  })

  it('clears the in-memory session when ApiClient invalidates an expired session', async () => {
    const active: AuthSession = { ...loginResult(['ALUMNO']), role: 'ALUMNO' }
    sessionStorage.save(active)

    const store = useAuthStore()
    await store.restore()
    const invalidate = setSessionInvalidationHandler.mock.calls[0]?.[0] as (() => void) | undefined

    expect(store.status).toBe('authenticated')
    expect(invalidate).toEqual(expect.any(Function))

    invalidate?.()

    expect(store.status).toBe('anonymous')
    expect(store.isAuthenticated).toBe(false)
    expect(sessionStorage.read()).toBeNull()
  })
})
