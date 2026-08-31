import { defineComponent, h } from 'vue'
import { createRouter, createWebHistory, type RouteLocationNormalized, useRoute, useRouter } from 'vue-router'
import type { Role } from '@/core/auth/contracts'
import { useAuthStore } from '@/stores/authStore'
import LoginView from '@/modules/auth/views/LoginView.vue'
import ForgotPasswordView from '@/modules/auth/views/ForgotPasswordView.vue'
import ResetPasswordView from '@/modules/auth/views/ResetPasswordView.vue'
import RoleSelectionView from '@/modules/auth/views/RoleSelectionView.vue'
import AppShell from '@/layouts/AppShell.vue'
import HomeView from '@/modules/home/views/HomeView.vue'
import ProfileView from '@/modules/profile/views/ProfileView.vue'
import AdminUsersView from '@/modules/admin/views/AdminUsersView.vue'
import AdminCareersView from '@/modules/admin/views/AdminCareersView.vue'
import AdminSubjectsView from '@/modules/admin/views/AdminSubjectsView.vue'
import AdminCoursesView from '@/modules/admin/views/AdminCoursesView.vue'
import AdminPeriodsView from '@/modules/admin/views/AdminPeriodsView.vue'
import SchedulesView from '@/modules/schedules/views/SchedulesView.vue'

export type RouteMeta = {
  guest?: boolean
  requiresSession?: boolean
  roleSelection?: boolean
  allowedRoles?: Role[]
}

const PlaceholderPage = (title: string) => defineComponent({
  name: `${title.replaceAll(' ', '')}Placeholder`,
  setup: () => () => h('main', { 'aria-label': title }, [h('h1', title)]),
})

const PasswordResetPage = ResetPasswordView
/* const PasswordResetPage = defineComponent({
  name: 'PasswordResetPlaceholder',
  setup: () => {
    const route = useRoute()
    const token = computed(() => typeof route.query.token === 'string' ? route.query.token : '')
    return () => h('main', { 'aria-label': 'Restablecer contraseña', 'data-reset-token': token.value }, [
      h('h1', 'Restablecer contraseña'),
    ])
  },
}) */

/* const RoleSelectionPage = defineComponent({
  name: 'RoleSelectionPage',
  setup: () => {
    const auth = useAuthStore()
    const router = useRouter()
    const select = async (role: Role) => {
      await auth.selectRole(role)
      await router.replace({ name: 'home' })
    }

    return () => h('main', { 'aria-label': 'Seleccionar rol' }, [
      h('h1', 'Seleccionar rol'),
      ...auth.roles.map((role) => h('button', {
        type: 'button',
        onClick: () => void select(role),
      }, role)),
    ])
  },
}) */

// Keep route shells render-function based: the production Vue runtime does not
// include the template compiler, so `template: '...'` would render a blank page.
const AppHomePage = defineComponent({
  name: 'AppHomePage',
  render: () => h(AppShell, null, { default: () => h(HomeView) }),
})
const ProfilePage = defineComponent({
  name: 'ProfilePage',
  render: () => h(AppShell, null, { default: () => h(ProfileView) }),
})
const AdminUsersPage = defineComponent({ name: 'AdminUsersPage', render: () => h(AppShell, null, { default: () => h(AdminUsersView) }) })
const AdminCareersPage = defineComponent({ name: 'AdminCareersPage', render: () => h(AppShell, null, { default: () => h(AdminCareersView) }) })
const AdminSubjectsPage = defineComponent({ name: 'AdminSubjectsPage', render: () => h(AppShell, null, { default: () => h(AdminSubjectsView) }) })
const AdminCoursesPage = defineComponent({ name: 'AdminCoursesPage', render: () => h(AppShell, null, { default: () => h(AdminCoursesView) }) })
const AdminPeriodsPage = defineComponent({ name: 'AdminPeriodsPage', render: () => h(AppShell, null, { default: () => h(AdminPeriodsView) }) })
const SchedulesPage = defineComponent({ name: 'SchedulesPage', render: () => h(AppShell, null, { default: () => h(SchedulesView) }) })

function routeMeta(route: RouteLocationNormalized): RouteMeta {
  return route.meta as RouteMeta
}

export function createAppRouter() {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', redirect: '/login' },
      { path: '/login', name: 'login', component: LoginView, meta: { guest: true } },
      { path: '/recuperar-contrasena', name: 'password-forgot', component: ForgotPasswordView, meta: { guest: true } },
      {
        path: '/restablecer-contrasena',
        name: 'password-reset',
        component: PasswordResetPage,
        meta: { guest: true },
      },
      { path: '/app', redirect: '/app/inicio' },
      {
        path: '/app/seleccionar-rol',
        name: 'role-selection',
        component: RoleSelectionView,
        meta: { requiresSession: true, roleSelection: true },
      },
      {
        path: '/app/inicio',
        name: 'home',
        component: AppHomePage,
        meta: { requiresSession: true },
      },
      {
        path: '/app/horarios',
        name: 'schedules',
        component: SchedulesPage,
        meta: { requiresSession: true, allowedRoles: ['ALUMNO', 'PROFESOR', 'ADMINISTRATIVO'] },
      },
      { path: '/app/administracion', redirect: '/app/administracion/usuarios', meta: { requiresSession: true, allowedRoles: ['ADMINISTRATIVO'] } },
      { path: '/app/administracion/usuarios', name: 'admin-users', component: AdminUsersPage, meta: { requiresSession: true, allowedRoles: ['ADMINISTRATIVO'] } },
      { path: '/app/administracion/usuarios/nuevo', name: 'admin-user-create', component: AdminUsersPage, meta: { requiresSession: true, allowedRoles: ['ADMINISTRATIVO'] } },
      { path: '/app/administracion/usuarios/:id', name: 'admin-user-detail', component: AdminUsersPage, meta: { requiresSession: true, allowedRoles: ['ADMINISTRATIVO'] } },
      { path: '/app/administracion/usuarios/:id/editar', name: 'admin-user-edit', component: AdminUsersPage, meta: { requiresSession: true, allowedRoles: ['ADMINISTRATIVO'] } },
      { path: '/app/administracion/carreras', name: 'admin-careers', component: AdminCareersPage, meta: { requiresSession: true, allowedRoles: ['ADMINISTRATIVO'] } },
      { path: '/app/administracion/carreras/nueva', name: 'admin-career-create', component: AdminCareersPage, meta: { requiresSession: true, allowedRoles: ['ADMINISTRATIVO'] } },
      { path: '/app/administracion/carreras/:id', name: 'admin-career-detail', component: AdminCareersPage, meta: { requiresSession: true, allowedRoles: ['ADMINISTRATIVO'] } },
      { path: '/app/administracion/carreras/:id/editar', name: 'admin-career-edit', component: AdminCareersPage, meta: { requiresSession: true, allowedRoles: ['ADMINISTRATIVO'] } },
      { path: '/app/administracion/materias', name: 'admin-subjects', component: AdminSubjectsPage, meta: { requiresSession: true, allowedRoles: ['ADMINISTRATIVO'] } },
      { path: '/app/administracion/materias/nueva', name: 'admin-subject-create', component: AdminSubjectsPage, meta: { requiresSession: true, allowedRoles: ['ADMINISTRATIVO'] } },
      { path: '/app/administracion/materias/:id', name: 'admin-subject-detail', component: AdminSubjectsPage, meta: { requiresSession: true, allowedRoles: ['ADMINISTRATIVO'] } },
      { path: '/app/administracion/materias/:id/editar', name: 'admin-subject-edit', component: AdminSubjectsPage, meta: { requiresSession: true, allowedRoles: ['ADMINISTRATIVO'] } },
      { path: '/app/administracion/cursadas', name: 'admin-courses', component: AdminCoursesPage, meta: { requiresSession: true, allowedRoles: ['ADMINISTRATIVO'] } },
      { path: '/app/administracion/cursadas/nueva', name: 'admin-course-create', component: AdminCoursesPage, meta: { requiresSession: true, allowedRoles: ['ADMINISTRATIVO'] } },
      { path: '/app/administracion/cursadas/:id', name: 'admin-course-detail', component: AdminCoursesPage, meta: { requiresSession: true, allowedRoles: ['ADMINISTRATIVO'] } },
      { path: '/app/administracion/cursadas/:id/editar', name: 'admin-course-edit', component: AdminCoursesPage, meta: { requiresSession: true, allowedRoles: ['ADMINISTRATIVO'] } },
      { path: '/app/administracion/periodos', name: 'admin-periods', component: AdminPeriodsPage, meta: { requiresSession: true, allowedRoles: ['ADMINISTRATIVO'] } },
      { path: '/app/administracion/periodos/nuevo', name: 'admin-period-create', component: AdminPeriodsPage, meta: { requiresSession: true, allowedRoles: ['ADMINISTRATIVO'] } },
      { path: '/app/administracion/periodos/:id', name: 'admin-period-detail', component: AdminPeriodsPage, meta: { requiresSession: true, allowedRoles: ['ADMINISTRATIVO'] } },
      { path: '/app/administracion/periodos/:id/editar', name: 'admin-period-edit', component: AdminPeriodsPage, meta: { requiresSession: true, allowedRoles: ['ADMINISTRATIVO'] } },
      {
        path: '/app/perfil',
        name: 'profile',
        component: ProfilePage,
        meta: { requiresSession: true },
      },
    ],
  })

  router.beforeEach(async (to) => {
    const auth = useAuthStore()
    await auth.restore()
    const meta = routeMeta(to)

    if (auth.status === 'anonymous') {
      return meta.requiresSession ? { name: 'login', query: { redirect: to.fullPath } } : true
    }

    if (auth.status === 'role_pending') {
      return meta.roleSelection ? true : { name: 'role-selection', query: { redirect: to.fullPath } }
    }

    if (meta.guest) return { name: 'home' }
    if (meta.roleSelection) return true
    if (meta.allowedRoles?.length && (!auth.activeRole || !meta.allowedRoles.includes(auth.activeRole))) return { name: 'home' }
    return true
  })

  return router
}

const router = createAppRouter()

export default router
