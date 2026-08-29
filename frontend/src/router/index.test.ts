import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { AuthSession } from '@/core/auth/contracts'
import { sessionStorage } from '@/core/storage/sessionStorage'
import { createAppRouter } from './index'

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

function session(role?: 'ALUMNO'): AuthSession {
  return {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    sessionId: 17,
    user,
    roles: ['ALUMNO'],
    role,
  }
}

describe('navigation guards', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    sessionStorage.clear()
  })

  it('sends anonymous visitors away from protected application routes', async () => {
    const router = createAppRouter()
    await router.push('/app/inicio')
    await router.isReady()

    expect(router.currentRoute.value.fullPath).toBe('/login')
  })

  it('limits a pending session to the role selector', async () => {
    sessionStorage.save(session())
    const router = createAppRouter()
    await router.push('/app/perfil')
    await router.isReady()

    expect(router.currentRoute.value.fullPath).toBe('/app/seleccionar-rol')
  })

  it('keeps an authenticated session out of guest pages and allows protected routes', async () => {
    sessionStorage.save(session('ALUMNO'))
    const router = createAppRouter()
    await router.push('/login')
    await router.isReady()
    expect(router.currentRoute.value.fullPath).toBe('/app/inicio')

    await router.push('/app/perfil')
    expect(router.currentRoute.value.fullPath).toBe('/app/perfil')
  })

  it('allows an authenticated session to reopen role selection for a role change', async () => {
    sessionStorage.save(session('ALUMNO'))
    const router = createAppRouter()
    await router.push('/app/seleccionar-rol')
    await router.isReady()

    expect(router.currentRoute.value.fullPath).toBe('/app/seleccionar-rol')
  })

  it('defines protected page shells with render functions supported by the runtime build', () => {
    const router = createAppRouter()
    const home = router.getRoutes().find((route) => route.name === 'home')?.components?.default
    const profile = router.getRoutes().find((route) => route.name === 'profile')?.components?.default

    expect(home).toHaveProperty('render', expect.any(Function))
    expect(profile).toHaveProperty('render', expect.any(Function))
  })
})
