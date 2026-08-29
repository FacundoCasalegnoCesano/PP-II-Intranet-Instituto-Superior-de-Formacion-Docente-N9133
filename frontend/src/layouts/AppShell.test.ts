import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import AppShell from './AppShell.vue'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))

vi.mock('vue-router', () => ({
  RouterLink: { template: '<a><slot /></a>' },
  useRoute: () => ({ name: 'home' }),
  useRouter: () => ({ push }),
}))

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    user: { apellidoNombre: 'Ada Lovelace' },
    activeRole: 'ALUMNO',
    roles: ['ALUMNO', 'PROFESOR'],
    logout: vi.fn(),
  }),
}))

describe('AppShell', () => {
  it('offers role switching only when multiple roles are available and opens the selector', async () => {
    const user = userEvent.setup()
    render(AppShell)

    await user.click(screen.getByRole('button', { name: /Ada Lovelace/i }))
    await user.click(screen.getByRole('menuitem', { name: 'Cambiar rol' }))

    expect(push).toHaveBeenCalledWith({ name: 'role-selection' })
  })

  it('opens and closes the responsive navigation drawer from the keyboard', async () => {
    const user = userEvent.setup()
    render(AppShell, { slots: { default: '<p>Contenido</p>' } })

    await user.click(screen.getByRole('button', { name: 'Abrir navegación' }))
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Navegación' })).not.toBeInTheDocument()
  })
})
