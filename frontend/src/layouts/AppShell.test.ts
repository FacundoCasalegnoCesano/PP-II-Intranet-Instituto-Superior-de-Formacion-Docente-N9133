import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import AppShell from './AppShell.vue'

const { push, authState } = vi.hoisted(() => ({
  push: vi.fn(),
  authState: { activeRole: 'ALUMNO' as 'ALUMNO' | 'PROFESOR' | 'ADMINISTRATIVO' },
}))

vi.mock('vue-router', () => ({
  RouterLink: { template: '<a><slot /></a>' },
  useRoute: () => ({ name: 'home' }),
  useRouter: () => ({ push }),
}))

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    user: { apellidoNombre: 'Ada Lovelace' },
    activeRole: authState.activeRole,
    roles: ['ALUMNO', 'PROFESOR'],
    logout: vi.fn(),
  }),
}))

describe('AppShell', () => {
  it('offers role switching only when multiple roles are available and opens the selector', async () => {
    const user = userEvent.setup()
    render(AppShell, { global: { stubs: { RouterLink: defineComponent({ setup: () => () => h('a', {}, 'Mi perfil') }) } } })
    await user.click(screen.getByRole('button', { name: /Ada Lovelace/i }))
    await user.click(screen.getByRole('menuitem', { name: 'Cambiar rol' }))
    expect(push).toHaveBeenCalledWith({ name: 'role-selection' })
  })

  it('opens and closes the responsive navigation drawer from the keyboard', async () => {
    const user = userEvent.setup()
    render(AppShell, { slots: { default: '<p>Contenido</p>' }, global: { stubs: { RouterLink: defineComponent({ setup: () => () => h('a', {}, 'Mi perfil') }) } } })
    await user.click(screen.getByRole('button', { name: 'Abrir navegación' }))
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Navegación' })).not.toBeInTheDocument()
  })

  it.each(['ALUMNO', 'PROFESOR', 'ADMINISTRATIVO'] as const)('shows Horarios in lateral and mobile navigation for %s', async (role) => {
    authState.activeRole = role
    const user = userEvent.setup()
    render(AppShell, { global: { stubs: { RouterLink: defineComponent({ setup: (_, { slots }) => () => h('a', { href: '#' }, slots.default?.()) }) } } })
    expect(screen.getByRole('link', { name: 'Horarios' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Abrir navegación' }))
    expect(screen.getAllByRole('link', { name: 'Horarios' })).toHaveLength(2)
  })

  it('shows student academic navigation instead of the obsolete upcoming placeholder', () => {
    authState.activeRole = 'ALUMNO'
    render(AppShell, { global: { stubs: { RouterLink: defineComponent({ setup: (_, { slots }) => () => h('a', { href: '#' }, slots.default?.()) }) } } })
    expect(screen.getByRole('link', { name: 'Trayectoria' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Mis materias' })).toBeVisible()
    expect(screen.getByRole('link', { name: /Ex.menes/ })).toBeVisible()
    expect(screen.queryByText(/M.dulos acad.micos/)).not.toBeInTheDocument()
  })
})
