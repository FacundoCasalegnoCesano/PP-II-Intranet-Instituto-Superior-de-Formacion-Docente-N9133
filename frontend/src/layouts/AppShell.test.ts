import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import AppShell from './AppShell.vue'

const { push, authState, routeState } = vi.hoisted(() => ({
  push: vi.fn(),
  authState: { activeRole: 'ALUMNO' as 'ALUMNO' | 'PROFESOR' | 'ADMINISTRATIVO' },
  routeState: { name: 'home' as string },
}))

vi.mock('vue-router', () => ({
  RouterLink: { template: '<a><slot /></a>' },
  useRoute: () => routeState,
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
  beforeEach(() => {
    authState.activeRole = 'ALUMNO'
    routeState.name = 'home'
    vi.clearAllMocks()
  })

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

  it('shows the careers catalog in desktop and mobile navigation only for ALUMNO', async () => {
    authState.activeRole = 'ALUMNO'
    const user = userEvent.setup()
    const RouterLink = defineComponent({
      props: { to: { type: Object, required: true } },
      setup: (props, { slots }) => () => h('a', { href: '#', 'data-route-name': (props.to as { name: string }).name }, slots.default?.()),
    })
    render(AppShell, { global: { stubs: { RouterLink } } })

    expect(screen.getByRole('link', { name: 'Carreras y planes' })).toHaveAttribute('data-route-name', 'student-careers')
    expect(screen.getByRole('link', { name: 'Horarios' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Mi perfil' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Abrir navegación' }))
    expect(screen.getAllByRole('link', { name: 'Carreras y planes' })).toHaveLength(2)
    for (const link of screen.getAllByRole('link', { name: 'Carreras y planes' })) {
      expect(link).toHaveAttribute('data-route-name', 'student-careers')
    }
  })

  it.each(['PROFESOR', 'ADMINISTRATIVO'] as const)('does not show student careers navigation for %s', (role) => {
    authState.activeRole = role
    render(AppShell, { global: { stubs: { RouterLink: defineComponent({ setup: (_, { slots }) => () => h('a', { href: '#' }, slots.default?.()) }) } } })

    expect(screen.queryByRole('link', { name: 'Carreras y planes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Trayectoria' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Horarios' })).toBeVisible()
    expect(screen.queryByRole('link', { name: 'Mi perfil' })).toBeVisible()
  })

  it('offers one teacher navigation entry on desktop and mobile', async () => {
    authState.activeRole = 'PROFESOR'
    const user = userEvent.setup()
    const RouterLink = defineComponent({
      inheritAttrs: false,
      props: { to: { type: Object, required: true } },
      setup: (props, { attrs, slots }) => () => h('a', {
        ...attrs,
        href: '#',
        'data-route-name': (props.to as { name: string }).name,
      }, slots.default?.()),
    })
    render(AppShell, { global: { stubs: { RouterLink } } })

    expect(screen.getByRole('link', { name: 'Mis cursadas' })).toHaveAttribute('data-route-name', 'teacher-courses')
    await user.click(screen.getByRole('button', { name: 'Abrir navegación' }))
    expect(screen.getAllByRole('link', { name: 'Mis cursadas' })).toHaveLength(2)
  })

  it.each([
    'teacher-courses',
    'teacher-course-students',
    'teacher-course-classes',
    'teacher-course-grades',
    'teacher-course-summary',
  ])('marks Mis cursadas active for route %s', (routeName) => {
    authState.activeRole = 'PROFESOR'
    routeState.name = routeName
    const RouterLink = defineComponent({
      inheritAttrs: false,
      props: { to: { type: Object, required: true } },
      setup: (_, { attrs, slots }) => () => h('a', { ...attrs, href: '#' }, slots.default?.()),
    })
    render(AppShell, { global: { stubs: { RouterLink } } })

    expect(screen.getByRole('link', { name: 'Mis cursadas' })).toHaveClass('bg-white/20', 'font-semibold')
  })

  it('keeps the active teacher link exposed with aria-current inside the mobile drawer', async () => {
    authState.activeRole = 'PROFESOR'
    routeState.name = 'teacher-course-grades'
    const user = userEvent.setup()
    const RouterLink = defineComponent({
      inheritAttrs: false,
      props: { to: { type: Object, required: true } },
      setup: (_, { attrs, slots }) => () => h('a', { ...attrs, href: '#' }, slots.default?.()),
    })
    render(AppShell, { global: { stubs: { RouterLink } } })

    expect(screen.getByRole('link', { name: 'Mis cursadas' })).toHaveAttribute('aria-current', 'page')
    await user.click(screen.getByRole('button', { name: 'Abrir navegación' }))
    expect(screen.getAllByRole('link', { name: 'Mis cursadas' })).toHaveLength(2)
    for (const link of screen.getAllByRole('link', { name: 'Mis cursadas' })) {
      expect(link).toHaveAttribute('aria-current', 'page')
    }
  })
})
