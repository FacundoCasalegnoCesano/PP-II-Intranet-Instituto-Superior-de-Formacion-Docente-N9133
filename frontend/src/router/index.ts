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

type AccessMeta = {
  guest?: boolean
  requiresSession?: boolean
  roleSelection?: boolean
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

function routeMeta(route: RouteLocationNormalized): AccessMeta {
  return route.meta as AccessMeta
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
      return meta.requiresSession ? { name: 'login' } : true
    }

    if (auth.status === 'role_pending') {
      return meta.roleSelection ? true : { name: 'role-selection' }
    }

    if (meta.guest) return { name: 'home' }
    if (meta.roleSelection) return true
    return true
  })

  return router
}

const router = createAppRouter()

export default router
