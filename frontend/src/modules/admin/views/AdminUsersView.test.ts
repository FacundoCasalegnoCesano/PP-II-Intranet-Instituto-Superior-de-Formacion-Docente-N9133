import { render, screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import AdminUsersView from './AdminUsersView.vue'

const mocks = vi.hoisted(() => ({
  listUsers: vi.fn(),
  getUser: vi.fn(),
}))

vi.mock('../api/adminApi', () => ({ adminApi: mocks }))
vi.mock('@/ui/feedback', () => ({ useFeedback: () => ({ success: vi.fn(), error: vi.fn() }) }))

const user = {
  idUsuario: 42,
  apellidoNombre: 'Ana Administrativa',
  dni: '30111222',
  email: 'ana@instituto.edu.ar',
  fechaNacimiento: '1990-05-10',
  telefono: '2215555555',
  activo: true,
  rol: 'ALUMNO' as const,
  roles: ['ALUMNO'] as const,
  alumno: null,
}

function createUsersRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app/administracion/usuarios', name: 'admin-users', component: AdminUsersView },
      { path: '/app/administracion/usuarios/nuevo', name: 'admin-user-create', component: AdminUsersView },
      { path: '/app/administracion/usuarios/:id', name: 'admin-user-detail', component: AdminUsersView },
      { path: '/app/administracion/usuarios/:id/editar', name: 'admin-user-edit', component: AdminUsersView },
    ],
  })
}

async function renderUsers() {
  mocks.listUsers.mockResolvedValue({ data: [user], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } })
  mocks.getUser.mockResolvedValue(user)
  const router = createUsersRouter()
  await router.push('/app/administracion/usuarios')
  await router.isReady()
  render(defineComponent({ render: () => h(RouterView) }), { global: { plugins: [router] } })
  return router
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AdminUsersView', () => {
  it('exposes Modificar roles from both the desktop row and mobile card with the account id and hash', async () => {
    const router = await renderUsers()
    const expectedHref = '/app/administracion/usuarios/42#roles-asignados'
    const row = await screen.findByRole('row', { name: /Ana Administrativa/ })
    const card = screen.getAllByRole('article').find((element) => element.textContent?.includes('Ana Administrativa'))

    expect(card).toBeDefined()
    expect(within(row).getByRole('link', { name: 'Modificar roles' })).toHaveAttribute('href', expectedHref)
    expect(within(card as HTMLElement).getByRole('link', { name: 'Modificar roles' })).toHaveAttribute('href', expectedHref)

    await userEvent.setup().click(within(row).getByRole('link', { name: 'Modificar roles' }))
    await waitFor(() => {
      expect(router.currentRoute.value.name).toBe('admin-user-detail')
      expect(router.currentRoute.value.params.id).toBe('42')
      expect(router.currentRoute.value.hash).toBe('#roles-asignados')
    })
  })

  it('renders the roles panel at the hash destination after loading the account detail', async () => {
    mocks.getUser.mockResolvedValue(user)
    const router = createUsersRouter()
    await router.push('/app/administracion/usuarios/42#roles-asignados')
    await router.isReady()
    const view = render(defineComponent({ render: () => h(RouterView) }), { global: { plugins: [router] } })

    expect(await screen.findByRole('heading', { name: 'Roles asignados' })).toBeVisible()
    expect(view.container.querySelector('#roles-asignados')).toBeInTheDocument()
    expect(mocks.getUser).toHaveBeenCalledWith(42)
  })
})
