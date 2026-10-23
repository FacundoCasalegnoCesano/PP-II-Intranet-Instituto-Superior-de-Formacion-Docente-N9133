import { defineComponent, h, nextTick, reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import AppShell from './AppShell.vue'

const { push, authState, routeState: initialRouteState } = vi.hoisted(() => ({
  push: vi.fn(),
  authState: { activeRole: 'ALUMNO' as 'ALUMNO' | 'PROFESOR' | 'ADMINISTRATIVO' },
  routeState: { name: 'home' as string, fullPath: '/app' },
}))
const routeState = reactive(initialRouteState)

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
    routeState.fullPath = '/app'
    vi.clearAllMocks()
  })

  it('offers role switching only when multiple roles are available and opens the selector', async () => {
    const user = userEvent.setup()
    render(AppShell, { global: { stubs: { RouterLink: defineComponent({ setup: () => () => h('a', {}, 'Mi perfil') }) } } })
    await user.click(screen.getByRole('button', { name: 'Menú de cuenta' }))
    await user.click(screen.getByRole('button', { name: 'Cambiar rol' }))
    expect(push).toHaveBeenCalledWith({ name: 'role-selection' })
  })

  it('exposes account links as a controlled native disclosure', async () => {
    const user = userEvent.setup()
    render(AppShell, { global: { stubs: { RouterLink: defineComponent({ setup: (_, { slots }) => () => h('a', { href: '#' }, slots.default?.()) }) } } })
    const trigger = screen.getByRole('button', { name: 'Menú de cuenta' })

    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveAttribute('aria-controls', 'account-disclosure')
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('link', { name: 'Mi perfil' })).toHaveLength(2)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cambiar rol' })).not.toHaveAttribute('role')
  })

  it('opens and closes the responsive navigation drawer from the keyboard', async () => {
    const user = userEvent.setup()
    render(AppShell, { slots: { default: '<p>Contenido</p>' }, global: { stubs: { RouterLink: defineComponent({ setup: () => () => h('a', {}, 'Mi perfil') }) } } })
    await user.click(screen.getByRole('button', { name: 'Abrir navegación' }))
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Navegación' })).not.toBeInTheDocument()
  })

  it.each(['ALUMNO', 'PROFESOR'] as const)('shows Horarios in lateral and mobile navigation for %s', async (role) => {
    authState.activeRole = role
    const user = userEvent.setup()
    render(AppShell, { global: { stubs: { RouterLink: defineComponent({ setup: (_, { slots }) => () => h('a', { href: '#' }, slots.default?.()) }) } } })
    expect(screen.getByRole('link', { name: 'Horarios' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Abrir navegación' }))
    expect(screen.getAllByRole('link', { name: 'Horarios' })).toHaveLength(2)
  })

  it('keeps Horarios inside Gestión académica for administration on desktop and mobile', async () => {
    authState.activeRole = 'ADMINISTRATIVO'
    const user = userEvent.setup()
    render(AppShell, { global: { stubs: { RouterLink: defineComponent({ setup: (_, { slots }) => () => h('a', { href: '#' }, slots.default?.()) }) } } })
    await user.click(screen.getByRole('button', { name: 'Gestión académica' }))
    expect(screen.getByRole('link', { name: 'Horarios' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Abrir navegación' }))
    expect(screen.getAllByRole('link', { name: 'Horarios' })).toHaveLength(2)
  })

  it('opens only one administrative group and supports native keyboard activation', async () => {
    authState.activeRole = 'ADMINISTRATIVO'
    const user = userEvent.setup()
    render(AppShell, { global: { stubs: { RouterLink: defineComponent({ setup: (_, { slots }) => () => h('a', { href: '#' }, slots.default?.()) }) } } })
    const users = screen.getByRole('button', { name: 'Usuarios' })
    users.focus()
    await user.keyboard('{Enter}')
    expect(users).toHaveAttribute('aria-expanded', 'true')
    await user.click(screen.getByRole('button', { name: 'Gestión académica' }))
    expect(users).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: 'Gestión académica' })).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById('desktop-admin-group-personas')).toHaveAttribute('inert')
    await user.keyboard(' ')
    expect(screen.getByRole('button', { name: 'Gestión académica' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens the group for a deep route and keeps the two grade destinations separate', async () => {
    authState.activeRole = 'ADMINISTRATIVO'
    routeState.name = 'admin-historical-exams'
    const user = userEvent.setup()
    const RouterLink = defineComponent({
      inheritAttrs: false,
      props: { to: { type: Object, required: true } },
      setup: (props, { attrs, slots }) => () => h('a', { ...attrs, href: '#', 'data-route-name': (props.to as { name: string }).name }, slots.default?.()),
    })
    render(AppShell, { global: { stubs: { RouterLink } } })
    expect(screen.getByRole('button', { name: 'Notas y exámenes' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'Calificaciones históricas' })).toHaveAttribute('aria-current', 'page')
    await user.click(screen.getByRole('link', { name: 'Calificaciones de cursadas' }))
    expect(screen.getByRole('link', { name: 'Calificaciones de cursadas' })).toHaveAttribute('data-route-name', 'admin-course-grades')
    expect(screen.getByRole('link', { name: 'Calificaciones históricas' })).toHaveAttribute('data-route-name', 'admin-historical-exams')
    await user.click(screen.getByRole('button', { name: 'Notas y exámenes' }))
    routeState.fullPath = '/app/administracion/mesas-historicas?panel=auditoria'
    await nextTick()
    expect(screen.getByRole('button', { name: 'Notas y exámenes' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('closes the mobile drawer and restores focus after choosing an administrative destination', async () => {
    authState.activeRole = 'ADMINISTRATIVO'
    const user = userEvent.setup()
    const RouterLink = defineComponent({
      inheritAttrs: false,
      props: { to: { type: Object, required: true } },
      setup: (props, { attrs, slots }) => () => h('a', { ...attrs, href: '#', 'data-route-name': (props.to as { name: string }).name }, slots.default?.()),
    })
    render(AppShell, { global: { stubs: { RouterLink } } })
    const trigger = screen.getByRole('button', { name: 'Abrir navegación' })
    await user.click(trigger)
    await user.click(screen.getAllByRole('button', { name: 'Usuarios' })[1])
    await user.click(screen.getAllByRole('link', { name: 'Inscripciones a carreras' })[1])
    expect(screen.queryByRole('dialog', { name: 'Navegación' })).not.toBeInTheDocument()
    expect(document.activeElement).toBe(trigger)
  })

  it('keeps Tab inside the drawer using only controls from the open group', async () => {
    authState.activeRole = 'ADMINISTRATIVO'
    const user = userEvent.setup()
    render(AppShell, { global: { stubs: { RouterLink: defineComponent({ setup: (_, { slots }) => () => h('a', { href: '#' }, slots.default?.()) }) } } })
    await user.click(screen.getByRole('button', { name: 'Abrir navegación' }))
    await user.click(screen.getAllByRole('button', { name: 'Usuarios' })[1])
    const notesGroup = screen.getAllByRole('button', { name: 'Notas y exámenes' })[1]
    notesGroup.focus()
    expect(document.getElementById('mobile-admin-group-notas-examenes')).toHaveAttribute('inert')
    await user.keyboard('{Tab}')
    const closeButtons = screen.getAllByRole('button', { name: 'Cerrar navegación' })
    expect(document.activeElement).toBe(closeButtons[0])
    await user.keyboard('{Shift>}{Tab}{/Shift}')
    expect(document.activeElement).toBe(notesGroup)
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
    if (role === 'ADMINISTRATIVO') {
      expect(screen.queryByRole('link', { name: 'Horarios' })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Mi perfil' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Gestión académica' })).toBeVisible()
    } else {
      expect(screen.getByRole('link', { name: 'Horarios' })).toBeVisible()
      expect(screen.getByRole('link', { name: 'Mi perfil' })).toBeVisible()
    }
  })

  it('shows the standard back button for the administrative career enrollments page', () => {
    authState.activeRole = 'ADMINISTRATIVO'
    routeState.name = 'admin-career-enrollments'
    render(AppShell, { global: { stubs: { RouterLink: defineComponent({ setup: (_, { slots }) => () => h('a', { href: '#' }, slots.default?.()) }) } } })

    expect(screen.getByRole('button', { name: 'Volver' })).toBeVisible()
  })

  it('shows the exam table entry for administrative and teacher roles', async () => {
    const user = userEvent.setup()
    for (const role of ['ADMINISTRATIVO', 'PROFESOR'] as const) {
      authState.activeRole = role
      render(AppShell, { global: { stubs: { RouterLink: defineComponent({ setup: (_, { slots }) => () => h('a', { href: '#' }, slots.default?.()) }) } } })
      if (role === 'ADMINISTRATIVO') await user.click(screen.getByRole('button', { name: 'Notas y exámenes' }))
      expect(screen.getByRole('link', { name: role === 'ADMINISTRATIVO' ? 'Mesas de examen' : 'Mis mesas' })).toBeVisible()
    }
  })

  it('shows Homologaciones in the administrative desktop and mobile navigation', async () => {
    authState.activeRole = 'ADMINISTRATIVO'
    const user = userEvent.setup()
    const RouterLink = defineComponent({
      inheritAttrs: false,
      props: { to: { type: Object, required: true } },
      setup: (props, { attrs, slots }) => () => h('a', { ...attrs, href: '#', 'data-route-name': (props.to as { name: string }).name }, slots.default?.()),
    })
    render(AppShell, { global: { stubs: { RouterLink } } })

    await user.click(screen.getByRole('button', { name: 'Notas y exámenes' }))
    expect(screen.getByRole('link', { name: 'Homologaciones' })).toHaveAttribute('data-route-name', 'admin-homologations')
    await user.click(screen.getByRole('button', { name: 'Abrir navegación' }))
    expect(screen.getAllByRole('link', { name: 'Homologaciones' })).toHaveLength(2)
  })

  it('shows Trayectorias in the administrative desktop and mobile navigation', async () => {
    authState.activeRole = 'ADMINISTRATIVO'
    const user = userEvent.setup()
    const RouterLink = defineComponent({
      inheritAttrs: false,
      props: { to: { type: Object, required: true } },
      setup: (props, { attrs, slots }) => () => h('a', { ...attrs, href: '#', 'data-route-name': (props.to as { name: string }).name }, slots.default?.()),
    })
    render(AppShell, { global: { stubs: { RouterLink } } })

    await user.click(screen.getByRole('button', { name: 'Usuarios' }))
    expect(screen.getByRole('link', { name: 'Trayectorias' })).toHaveAttribute('data-route-name', 'admin-academic-records')
    await user.click(screen.getByRole('button', { name: 'Abrir navegación' }))
    expect(screen.getAllByRole('link', { name: 'Trayectorias' })).toHaveLength(2)
  })

  it.each(['admin-academic-records', 'admin-academic-record-detail'] as const)('marks Trayectorias active for route %s', (routeName) => {
    authState.activeRole = 'ADMINISTRATIVO'
    routeState.name = routeName
    render(AppShell, { global: { stubs: { RouterLink: defineComponent({ setup: (_, { slots }) => () => h('a', { href: '#' }, slots.default?.()) }) } } })

    expect(screen.getByRole('link', { name: 'Trayectorias' })).toHaveAttribute('aria-current', 'page')
  })

  it.each(['admin-homologations', 'admin-homologation-create', 'admin-homologation-detail'] as const)('marks Homologaciones active for route %s only', (routeName) => {
    authState.activeRole = 'ADMINISTRATIVO'
    routeState.name = routeName
    const RouterLink = defineComponent({
      inheritAttrs: false,
      props: { to: { type: Object, required: true } },
      setup: (_, { attrs, slots }) => () => h('a', { ...attrs, href: '#' }, slots.default?.()),
    })
    render(AppShell, { global: { stubs: { RouterLink } } })

    expect(screen.getByRole('link', { name: 'Homologaciones' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Usuarios' })).toHaveAttribute('aria-expanded', 'false')
  })

  it.each(['admin-exams', 'admin-exam-detail', 'admin-exam-edit'] as const)('marks administrative exam navigation active for %s', (routeName) => {
    authState.activeRole = 'ADMINISTRATIVO'
    routeState.name = routeName
    render(AppShell, { global: { stubs: { RouterLink: defineComponent({ setup: (_, { slots }) => () => h('a', { href: '#' }, slots.default?.()) }) } } })
    expect(screen.getByRole('link', { name: 'Mesas de examen' })).toHaveAttribute('aria-current', 'page')
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

    expect(screen.getByRole('link', { name: 'Cursado' })).toHaveAttribute('data-route-name', 'teacher-courses')
    await user.click(screen.getByRole('button', { name: 'Abrir navegación' }))
    expect(screen.getAllByRole('link', { name: 'Cursado' })).toHaveLength(2)
  })

  it.each([
    'teacher-courses',
    'teacher-course-students',
    'teacher-course-classes',
    'teacher-course-grades',
    'teacher-course-summary',
  ])('marks Cursado active for route %s', (routeName) => {
    authState.activeRole = 'PROFESOR'
    routeState.name = routeName
    const RouterLink = defineComponent({
      inheritAttrs: false,
      props: { to: { type: Object, required: true } },
      setup: (_, { attrs, slots }) => () => h('a', { ...attrs, href: '#' }, slots.default?.()),
    })
    render(AppShell, { global: { stubs: { RouterLink } } })

    expect(screen.getByRole('link', { name: 'Cursado' })).toHaveClass('bg-white/20', 'font-semibold')
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

    expect(screen.getByRole('link', { name: 'Cursado' })).toHaveAttribute('aria-current', 'page')
    await user.click(screen.getByRole('button', { name: 'Abrir navegación' }))
    expect(screen.getAllByRole('link', { name: 'Cursado' })).toHaveLength(2)
    for (const link of screen.getAllByRole('link', { name: 'Cursado' })) {
      expect(link).toHaveAttribute('aria-current', 'page')
    }
  })
})
