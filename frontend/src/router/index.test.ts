import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { AuthSession, Role } from '@/core/auth/contracts'
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

function session(role?: Role, roles: Role[] = ['ALUMNO']): AuthSession {
  return {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    sessionId: 17,
    user,
    roles,
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

    expect(router.currentRoute.value.fullPath).toBe('/login?redirect=/app/inicio')
  })

  it('limits a pending session to the role selector', async () => {
    sessionStorage.save(session())
    const router = createAppRouter()
    await router.push('/app/perfil')
    await router.isReady()

    expect(router.currentRoute.value.fullPath).toBe('/app/seleccionar-rol?redirect=/app/perfil')
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

  it('guards the administrative console by the selected role and exposes its module routes', async () => {
    sessionStorage.save({ ...session('ALUMNO'), roles: ['ALUMNO'], role: 'ALUMNO' })
    const studentRouter = createAppRouter()
    await studentRouter.push('/app/administracion/usuarios')
    await studentRouter.isReady()
    expect(studentRouter.currentRoute.value.name).toBe('home')

    sessionStorage.save({ ...session('ALUMNO'), roles: ['ADMINISTRATIVO'], role: 'ADMINISTRATIVO', user: { ...user, rol: 'ADMINISTRATIVO' } })
    const adminRouter = createAppRouter()
    await adminRouter.push('/app/administracion/usuarios')
    await adminRouter.isReady()
    expect(adminRouter.currentRoute.value.name).toBe('admin-users')
    expect(adminRouter.getRoutes().filter((route) => String(route.name).startsWith('admin-')).length).toBeGreaterThanOrEqual(20)
  })

  it.each(['ALUMNO', 'PROFESOR', 'ADMINISTRATIVO'] as const)('allows %s to open published schedules', async (role) => {
    sessionStorage.save({ ...session(role, [role]), user: { ...user, rol: role } })
    const router = createAppRouter()
    await router.push('/app/horarios')
    await router.isReady()
    expect(router.currentRoute.value.name).toBe('schedules')
  })

  it('keeps the three student academic routes exclusive to the ALUMNO role', async () => {
    sessionStorage.save({ ...session('ALUMNO'), roles: ['ALUMNO'], role: 'ALUMNO' })
    const studentRouter = createAppRouter()
    for (const route of ['/app/alumno/trayectoria', '/app/alumno/materias', '/app/alumno/examenes']) {
      await studentRouter.push(route)
      expect(studentRouter.currentRoute.value.fullPath).toBe(route)
    }

    sessionStorage.save({ ...session('PROFESOR', ['PROFESOR']), user: { ...user, rol: 'PROFESOR' } })
    const teacherRouter = createAppRouter()
    await teacherRouter.push('/app/alumno/materias')
    expect(teacherRouter.currentRoute.value.name).toBe('home')
  })
})
