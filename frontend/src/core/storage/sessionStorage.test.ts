import { afterEach, describe, expect, it } from 'vitest'
import type { AuthSession } from '@/core/auth/contracts'
import { SessionStorage } from './sessionStorage'

const session: AuthSession = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
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
}

afterEach(() => window.sessionStorage.clear())

describe('SessionStorage', () => {
  it('persists a versioned session in sessionStorage only', () => {
    const storage = new SessionStorage()

    storage.save(session)

    expect(storage.read()).toEqual(session)
    expect(window.sessionStorage.getItem('isfd.auth.session.v1')).toContain('"version":1')
  })

  it('restores sessions whose DNI is normalized as a string', () => {
    const storage = new SessionStorage()
    const normalizedSession = { ...session, user: { ...session.user, dni: '12345678' } }

    storage.save(normalizedSession)

    expect(storage.read()).toEqual(normalizedSession)
  })

  it('treats corrupt data as an empty session and removes it', () => {
    window.sessionStorage.setItem('isfd.auth.session.v1', '{not-json')

    expect(new SessionStorage().read()).toBeNull()
    expect(window.sessionStorage.getItem('isfd.auth.session.v1')).toBeNull()
  })

  it('updates rotated tokens without losing the remaining session data', () => {
    const storage = new SessionStorage()
    storage.save(session)

    storage.updateTokens({ accessToken: 'access-2', refreshToken: 'refresh-2' })

    expect(storage.read()).toEqual({
      ...session,
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
    })
  })
})
