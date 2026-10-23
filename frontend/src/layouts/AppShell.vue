<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { BadgeCheck, BookOpen, CalendarDays, ChevronDown, ClipboardList, GraduationCap, Home, LibraryBig, LogOut, Menu, Repeat2, ShieldCheck, UserRound, X } from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import AppBackButton from '@/ui/AppBackButton.vue'
import ConfirmDialog from '@/ui/ConfirmDialog.vue'
import logoUrl from '@/assets/logo-calvario.jpg'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const drawerOpen = ref(false)
const userMenuOpen = ref(false)
const confirmLogoutOpen = ref(false)
const loggingOut = ref(false)
const openAdminGroup = ref<string | null>(null)
const drawer = ref<HTMLElement>()
const drawerTrigger = ref<HTMLButtonElement>()
const drawerCloseButton = ref<HTMLButtonElement>()
const userMenuTrigger = ref<HTMLButtonElement>()
const baseNavItems = [
  { name: 'home', label: 'Inicio', icon: Home },
  { name: 'schedules', label: 'Horarios', icon: CalendarDays },
  { name: 'profile', label: 'Mi perfil', icon: UserRound },
] as const
const studentNavItems = [
  { name: 'student-careers', label: 'Carreras y planes', icon: LibraryBig },
  { name: 'academic-record', label: 'Trayectoria', icon: BookOpen },
  { name: 'subject-enrollments', label: 'Mis materias', icon: BookOpen },
  { name: 'student-exams', label: 'Exámenes', icon: BookOpen },
] as const
const adminNavItems = [
  { name: 'admin-users', label: 'Usuarios', icon: ShieldCheck },
  { name: 'admin-academic-records', label: 'Trayectorias', icon: GraduationCap },
  { name: 'admin-careers', label: 'Carreras', icon: BookOpen },
  { name: 'admin-career-enrollments', label: 'Inscripciones a carreras', icon: ClipboardList },
  { name: 'admin-subjects', label: 'Materias', icon: BookOpen },
  { name: 'admin-courses', label: 'Cursadas', icon: BookOpen },
  { name: 'admin-course-grades', label: 'Calificaciones de cursadas', icon: BookOpen },
  { name: 'admin-periods', label: 'Períodos', icon: BookOpen },
  { name: 'admin-exams', label: 'Mesas de examen', icon: ClipboardList },
  { name: 'admin-historical-exams', label: 'Calificaciones históricas', icon: ClipboardList },
  { name: 'admin-homologations', label: 'Homologaciones', icon: BadgeCheck },
] as const
const adminNavGroups = [
  {
    id: 'personas',
    label: 'Usuarios',
    items: [adminNavItems[0], adminNavItems[3], adminNavItems[1]],
  },
  {
    id: 'gestion-academica',
    label: 'Gestión académica',
    items: [adminNavItems[2], adminNavItems[4], baseNavItems[1], adminNavItems[5], adminNavItems[7]],
  },
  {
    id: 'notas-examenes',
    label: 'Notas y exámenes',
    items: [adminNavItems[6], adminNavItems[8], adminNavItems[9], adminNavItems[10]],
  },
] as const
const teacherNavItems = [
  { name: 'teacher-courses', label: 'Cursado', icon: BookOpen },
  { name: 'teacher-exams', label: 'Mis mesas', icon: ClipboardList },
] as const
const navItems = computed(() => {
  if (auth.activeRole === 'ADMINISTRATIVO') return [baseNavItems[0]]
  if (auth.activeRole === 'ALUMNO') return [...baseNavItems, ...studentNavItems]
  if (auth.activeRole === 'PROFESOR') return [...baseNavItems, ...teacherNavItems]
  return baseNavItems
})
const roleLabel = computed(() => {
  if (!auth.activeRole) return 'Sin rol'
  return { ALUMNO: 'Alumno/a', PROFESOR: 'Profesor/a', ADMINISTRATIVO: 'Administrativo/a' }[auth.activeRole]
})
const canChangeRole = computed(() => auth.roles.length > 1)
function isNavItemActive(name: string): boolean {
  if (name === 'teacher-courses') return typeof route.name === 'string' && route.name.startsWith('teacher-course')
  if (name === 'teacher-exams') return typeof route.name === 'string' && route.name.startsWith('teacher-exam')
  if (name === 'admin-exams') return typeof route.name === 'string' && route.name.startsWith('admin-exam')
  if (name === 'admin-homologations') return typeof route.name === 'string' && route.name.startsWith('admin-homologation')
  if (name === 'admin-academic-records') return typeof route.name === 'string' && route.name.startsWith('admin-academic-record')
  if (name === 'admin-users') return typeof route.name === 'string' && route.name.startsWith('admin-user')
  if (name === 'admin-careers') return ['admin-careers', 'admin-career-create', 'admin-career-detail', 'admin-career-edit'].includes(String(route.name))
  if (name === 'admin-subjects') return typeof route.name === 'string' && route.name.startsWith('admin-subject')
  if (name === 'admin-courses') return ['admin-courses', 'admin-course-create', 'admin-course-detail', 'admin-course-edit'].includes(String(route.name))
  if (name === 'admin-periods') return typeof route.name === 'string' && route.name.startsWith('admin-period')
  return route.name === name
}
function toggleAdminGroup(id: string): void {
  openAdminGroup.value = openAdminGroup.value === id ? null : id
}
function groupIsActive(groupId: string): boolean {
  const group = adminNavGroups.find((item) => item.id === groupId)
  return group?.items.some((item) => isNavItemActive(item.name)) ?? false
}
watch(() => [auth.activeRole, route.fullPath], () => {
  if (auth.activeRole !== 'ADMINISTRATIVO') return
  const activeGroup = adminNavGroups.find((group) => group.items.some((item) => isNavItemActive(item.name)))
  if (activeGroup) openAdminGroup.value = activeGroup.id
}, { immediate: true })

function closeDrawer(): void { drawerOpen.value = false }
async function goToRoleSelection(): Promise<void> {
  userMenuOpen.value = false
  await router.push({ name: 'role-selection' })
}
function onEscape(event: KeyboardEvent): void {
  if (drawerOpen.value && event.key === 'Escape') {
    event.preventDefault()
    closeDrawer()
    return
  }
  if (drawerOpen.value && event.key === 'Tab') {
    const focusable = Array.from(drawer.value?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []).filter((element) => {
      let current: HTMLElement | null = element
      while (current) {
        const style = window.getComputedStyle(current)
        if (current.hasAttribute('inert') || current.getAttribute('aria-hidden') === 'true' || style.display === 'none' || style.visibility === 'hidden') return false
        if (current === drawer.value) break
        current = current.parentElement
      }
      return true
    })
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
    return
  }
  if (userMenuOpen.value && event.key === 'Escape') {
    event.preventDefault()
    userMenuOpen.value = false
    userMenuTrigger.value?.focus()
  }
}
window.addEventListener('keydown', onEscape)
onBeforeUnmount(() => window.removeEventListener('keydown', onEscape))
watch(drawerOpen, async (open) => {
  if (open) {
    await nextTick()
    drawerCloseButton.value?.focus()
  } else if (drawerTrigger.value?.isConnected) {
    drawerTrigger.value.focus()
  }
})

async function logout(): Promise<void> {
  loggingOut.value = true
  try {
    await auth.logout()
    await router.replace({ name: 'login' })
  } finally {
    loggingOut.value = false
    confirmLogoutOpen.value = false
  }
}
</script>

<template>
  <div class="min-h-screen min-w-0 bg-[var(--color-background)] lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
    <aside class="app-sidebar hidden min-h-screen bg-[var(--color-sidebar)] px-4 py-6 text-white lg:block">
      <div class="flex items-center gap-3 px-3"><img :src="logoUrl" alt="" class="size-10 shrink-0 rounded-md bg-white object-contain p-1" aria-hidden="true" /><span class="text-lg font-semibold">ISPI N.º 9133</span></div>
      <nav class="mt-10" aria-label="Navegación lateral">
        <template v-if="auth.activeRole === 'ADMINISTRATIVO'">
          <RouterLink :to="{ name: 'home' }" class="mb-1 flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-white/90 hover:bg-white/15" :class="isNavItemActive('home') ? 'bg-white/20 font-semibold' : ''" :aria-current="isNavItemActive('home') ? 'page' : undefined"><Home class="size-5" aria-hidden="true" />Inicio</RouterLink>
          <section v-for="group in adminNavGroups" :key="group.id" class="mt-1">
            <button type="button" class="flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-white/90 hover:bg-white/15" :class="groupIsActive(group.id) ? 'font-semibold' : ''" :aria-expanded="openAdminGroup === group.id" :aria-controls="`desktop-admin-group-${group.id}`" @click="toggleAdminGroup(group.id)">
              <span>{{ group.label }}</span><ChevronDown class="size-4 transition-transform motion-reduce:transition-none" :class="openAdminGroup === group.id ? 'rotate-180' : ''" aria-hidden="true" />
            </button>
            <Transition name="admin-group-panel">
              <div :id="`desktop-admin-group-${group.id}`" v-show="openAdminGroup === group.id" :inert="openAdminGroup !== group.id" :aria-hidden="openAdminGroup !== group.id" class="admin-group-panel">
                <div class="ml-2 border-l border-white/20 pl-2">
                  <RouterLink v-for="item in group.items" :key="item.name" :to="{ name: item.name }" class="mb-1 flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-white/90 hover:bg-white/15" :class="isNavItemActive(item.name) ? 'bg-white/20 font-semibold' : ''" :aria-current="isNavItemActive(item.name) ? 'page' : undefined"><component :is="item.icon" class="size-5" aria-hidden="true" />{{ item.label }}</RouterLink>
                </div>
              </div>
            </Transition>
          </section>
        </template>
        <RouterLink v-else v-for="item in navItems" :key="item.name" :to="{ name: item.name }" class="mb-1 flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-white/90 hover:bg-white/15" :class="isNavItemActive(item.name) ? 'bg-white/20 font-semibold' : ''" :aria-current="isNavItemActive(item.name) ? 'page' : undefined">
          <component :is="item.icon" class="size-5" aria-hidden="true" />{{ item.label }}
        </RouterLink>
      </nav>
    </aside>

    <div class="min-w-0">
      <header class="flex min-h-16 items-center justify-between border-b border-[var(--color-border)] bg-white px-4 sm:px-7">
        <button ref="drawerTrigger" type="button" class="min-h-11 min-w-11 rounded p-2 lg:hidden" aria-label="Abrir navegación" :aria-expanded="drawerOpen" aria-controls="mobile-navigation" @click="drawerOpen = true"><Menu class="size-6" aria-hidden="true" /></button>
        <p class="hidden text-sm text-[var(--color-graphite)] sm:block">Instituto Superior de Formación Docente N.º 9133</p>
        <div class="relative ml-auto">
          <button id="account-disclosure-trigger" ref="userMenuTrigger" type="button" class="flex min-h-11 items-center gap-2 rounded-md px-2 py-1 text-left" aria-label="Menú de cuenta" :aria-expanded="userMenuOpen" aria-controls="account-disclosure" @click="userMenuOpen = !userMenuOpen">
            <span class="grid size-8 place-items-center rounded-full bg-[#f4e7e7] font-semibold text-[var(--color-brand)]">{{ auth.user?.apellidoNombre?.charAt(0) ?? 'U' }}</span>
            <span class="hidden sm:block"><span class="block text-sm font-semibold text-[var(--color-text)]">{{ auth.user?.apellidoNombre }}</span><span class="block text-xs text-[var(--color-graphite)]">{{ roleLabel }}</span></span><ChevronDown class="size-4" />
          </button>
          <div v-show="userMenuOpen" id="account-disclosure" class="absolute right-0 z-20 mt-2 w-52 rounded-md border border-[var(--color-border)] bg-white p-1 shadow-lg">
            <RouterLink :to="{ name: 'profile' }" class="flex min-h-11 items-center rounded px-3 py-2 hover:bg-[#f6f7f4]" @click="userMenuOpen = false">Mi perfil</RouterLink>
            <button v-if="canChangeRole" type="button" class="flex min-h-11 w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-[#f6f7f4]" @click="goToRoleSelection"><Repeat2 class="size-4" />Cambiar rol</button>
            <button type="button" class="flex min-h-11 w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-[#f6f7f4]" @click="confirmLogoutOpen = true; userMenuOpen = false"><LogOut class="size-4" />Cerrar sesión</button>
          </div>
        </div>
      </header>
      <div class="min-w-0 p-4 sm:p-7"><AppBackButton /><slot /></div>
    </div>

    <div v-if="drawerOpen" id="mobile-navigation" ref="drawer" role="dialog" aria-modal="true" aria-label="Navegación" class="fixed inset-0 z-40 lg:hidden">
      <button type="button" class="absolute inset-0 bg-black/40" aria-label="Cerrar navegación" @click="closeDrawer" />
      <aside class="app-sidebar relative h-full w-[min(18rem,calc(100vw-2rem))] overflow-y-auto bg-[var(--color-sidebar)] p-5 text-white shadow-xl">
        <div class="flex items-center justify-between gap-3"><span class="font-semibold">ISPI N.º 9133</span><button ref="drawerCloseButton" type="button" aria-label="Cerrar navegación" class="min-h-11 min-w-11 rounded p-2" @click="closeDrawer"><X class="size-5" aria-hidden="true" /></button></div>
        <nav class="mt-8" aria-label="Navegación principal">
          <template v-if="auth.activeRole === 'ADMINISTRATIVO'">
            <RouterLink :to="{ name: 'home' }" class="mb-2 flex min-h-11 items-center gap-3 rounded-md px-3 py-2 hover:bg-white/15" :class="isNavItemActive('home') ? 'bg-white/20 font-semibold' : ''" :aria-current="isNavItemActive('home') ? 'page' : undefined" @click="closeDrawer"><Home class="size-5" aria-hidden="true" />Inicio</RouterLink>
            <section v-for="group in adminNavGroups" :key="group.id" class="mt-1">
              <button type="button" class="flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left hover:bg-white/15" :class="groupIsActive(group.id) ? 'font-semibold' : ''" :aria-expanded="openAdminGroup === group.id" :aria-controls="`mobile-admin-group-${group.id}`" @click="toggleAdminGroup(group.id)">
                <span>{{ group.label }}</span><ChevronDown class="size-4 transition-transform motion-reduce:transition-none" :class="openAdminGroup === group.id ? 'rotate-180' : ''" aria-hidden="true" />
              </button>
              <Transition name="admin-group-panel">
                <div :id="`mobile-admin-group-${group.id}`" v-show="openAdminGroup === group.id" :inert="openAdminGroup !== group.id" :aria-hidden="openAdminGroup !== group.id" class="admin-group-panel">
                  <div class="ml-2 border-l border-white/20 pl-2">
                    <RouterLink v-for="item in group.items" :key="item.name" :to="{ name: item.name }" class="mb-2 flex min-h-11 items-center gap-3 rounded-md px-3 py-2 hover:bg-white/15" :class="isNavItemActive(item.name) ? 'bg-white/20 font-semibold' : ''" :aria-current="isNavItemActive(item.name) ? 'page' : undefined" @click="closeDrawer"><component :is="item.icon" class="size-5" aria-hidden="true" />{{ item.label }}</RouterLink>
                  </div>
                </div>
              </Transition>
            </section>
          </template>
          <RouterLink v-else v-for="item in navItems" :key="item.name" :to="{ name: item.name }" class="mb-2 flex min-h-11 items-center gap-3 rounded-md px-3 py-2 hover:bg-white/15" :class="isNavItemActive(item.name) ? 'bg-white/20 font-semibold' : ''" :aria-current="isNavItemActive(item.name) ? 'page' : undefined" @click="closeDrawer"><component :is="item.icon" class="size-5" />{{ item.label }}</RouterLink>
        </nav>
      </aside>
    </div>
    <ConfirmDialog :open="confirmLogoutOpen" title="Cerrar sesión" description="Tendrás que ingresar nuevamente para continuar." confirm-label="Cerrar sesión" :loading="loggingOut" @cancel="confirmLogoutOpen = false" @confirm="logout" />
  </div>
</template>

<style scoped>
.admin-group-panel-enter-active,
.admin-group-panel-leave-active {
  display: grid;
  grid-template-rows: 1fr;
  opacity: 1;
  transition: grid-template-rows 180ms ease, opacity 180ms ease;
}

.admin-group-panel-enter-from,
.admin-group-panel-leave-to {
  grid-template-rows: 0fr;
  opacity: 0;
}

.admin-group-panel > div {
  min-height: 0;
  overflow: hidden;
}

@media (prefers-reduced-motion: reduce) {
  .admin-group-panel-enter-active,
  .admin-group-panel-leave-active {
    transition: none;
  }
}
</style>
