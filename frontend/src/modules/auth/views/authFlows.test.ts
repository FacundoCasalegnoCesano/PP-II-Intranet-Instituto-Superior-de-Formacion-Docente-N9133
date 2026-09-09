import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { createPinia, setActivePinia } from 'pinia'
import LoginView from './LoginView.vue'
import RoleSelectionView from './RoleSelectionView.vue'

const { login, selectRole } = vi.hoisted(() => ({
  login: vi.fn(),
  selectRole: vi.fn(),
}))

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    login,
    selectRole,
    roles: ['ALUMNO', 'PROFESOR'],
  }),
}))

vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

describe('access forms', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    login.mockReset()
    selectRole.mockReset()
  })

  it('shows an inline login error without exposing internal details', async () => {
    login.mockRejectedValueOnce(new Error('database connection string'))
    const user = userEvent.setup()
    render(LoginView)

    await user.type(screen.getByLabelText('Correo electrónico o DNI'), 'ada@example.test')
    await user.type(screen.getByLabelText('Contraseña'), 'secret-password')
    await user.click(screen.getByRole('button', { name: 'Ingresar' }))

    expect(await screen.findByText('No pudimos iniciar sesión. Revisá los datos e intentá nuevamente.')).toBeVisible()
    expect(screen.queryByText('database connection string')).not.toBeInTheDocument()
  })

  it('selects a pending role from an accessible role card', async () => {
    const user = userEvent.setup()
    render(RoleSelectionView)

    await user.click(screen.getByRole('button', { name: /Continuar como Profesor/i }))

    expect(selectRole).toHaveBeenCalledWith('PROFESOR')
  })
})
