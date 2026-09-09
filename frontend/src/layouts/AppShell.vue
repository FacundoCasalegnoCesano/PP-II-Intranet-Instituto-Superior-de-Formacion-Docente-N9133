<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { BookOpen, CalendarDays, ChevronDown, Home, LibraryBig, LogOut, Menu, Repeat2, ShieldCheck, UserRound, X } from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import AppButton from '@/ui/AppButton.vue'
import ConfirmDialog from '@/ui/ConfirmDialog.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const drawerOpen = ref(false)
const userMenuOpen = ref(false)
const confirmLogoutOpen = ref(false)
const loggingOut = ref(false)
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
  { name: 'admin-careers', label: 'Carreras', icon: BookOpen },
  { name: 'admin-subjects', label: 'Materias', icon: BookOpen },
  { name: 'admin-courses', label: 'Cursadas', icon: BookOpen },
  { name: 'admin-periods', label: 'Períodos', icon: BookOpen },
] as const
const teacherNavItems = [
  { name: 'teacher-courses', label: 'Mis cursadas', icon: BookOpen },
] as const
const navItems = computed(() => {
  if (auth.activeRole === 'ADMINISTRATIVO') return [...baseNavItems, ...adminNavItems]
  if (auth.activeRole === 'ALUMNO') return [...baseNavItems, ...studentNavItems]
  if (auth.activeRole === 'PROFESOR') return [...baseNavItems, ...teacherNavItems]
  return baseNavItems
})
const roleLabel = computed(() => ({ ALUMNO: 'Alumno/a', PROFESOR: 'Profesor/a', ADMINISTRATIVO: 'Administrativo/a' }[auth.activeRole ?? ''] ?? 'Sin rol'))
const canChangeRole = computed(() => auth.roles.length > 1)
function isNavItemActive(name: string): boolean {
  if (name === 'teacher-courses') return typeof route.name === 'string' && route.name.startsWith('teacher-course')
  return route.name === name
}

function closeDrawer(): void { drawerOpen.value = false }
async function goToRoleSelection(): Promise<void> {
  userMenuOpen.value = false
  await router.push({ name: 'role-selection' })
}
function onEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeDrawer()
}
window.addEventListener('keydown', onEscape)
onBeforeUnmount(() => window.removeEventListener('keydown', onEscape))

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
  <div class="min-h-screen bg-[var(--color-background)] lg:grid lg:grid-cols-[17rem_1fr]">
    <aside class="hidden min-h-screen bg-[var(--color-sidebar)] px-4 py-6 text-white lg:block">
      <div class="flex items-center gap-3 px-3"><BookOpen class="size-7" aria-hidden="true" /><span class="text-lg font-semibold">ISFD N.º 9133</span></div>
      <nav class="mt-10" aria-label="Navegación lateral">
        <RouterLink v-for="item in navItems" :key="item.name" :to="{ name: item.name }" class="mb-1 flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-white/90 hover:bg-white/15" :class="isNavItemActive(item.name) ? 'bg-white/20 font-semibold' : ''" :aria-current="isNavItemActive(item.name) ? 'page' : undefined">
          <component :is="item.icon" class="size-5" aria-hidden="true" />{{ item.label }}
        </RouterLink>
      </nav>
    </aside>

    <div class="min-w-0">
      <header class="flex min-h-16 items-center justify-between border-b border-[var(--color-border)] bg-white px-4 sm:px-7">
        <button type="button" class="rounded p-2 lg:hidden" aria-label="Abrir navegación" @click="drawerOpen = true"><Menu class="size-6" /></button>
        <p class="hidden text-sm text-[var(--color-graphite)] sm:block">Instituto Superior de Formación Docente N.º 9133</p>
        <div class="relative ml-auto">
          <button type="button" class="flex items-center gap-2 rounded-md px-2 py-1 text-left" :aria-expanded="userMenuOpen" aria-haspopup="menu" @click="userMenuOpen = !userMenuOpen">
            <span class="grid size-8 place-items-center rounded-full bg-[#f4e7e7] font-semibold text-[var(--color-brand)]">{{ auth.user?.apellidoNombre?.charAt(0) ?? 'U' }}</span>
            <span class="hidden sm:block"><span class="block text-sm font-semibold text-[var(--color-text)]">{{ auth.user?.apellidoNombre }}</span><span class="block text-xs text-[var(--color-graphite)]">{{ roleLabel }}</span></span><ChevronDown class="size-4" />
          </button>
          <div v-if="userMenuOpen" role="menu" class="absolute right-0 z-20 mt-2 w-52 rounded-md border border-[var(--color-border)] bg-white p-1 shadow-lg">
            <RouterLink :to="{ name: 'profile' }" role="menuitem" class="block rounded px-3 py-2 hover:bg-[#f6f7f4]" @click="userMenuOpen = false">Mi perfil</RouterLink>
            <button v-if="canChangeRole" type="button" role="menuitem" class="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-[#f6f7f4]" @click="goToRoleSelection"><Repeat2 class="size-4" />Cambiar rol</button>
            <button type="button" role="menuitem" class="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-[#f6f7f4]" @click="confirmLogoutOpen = true; userMenuOpen = false"><LogOut class="size-4" />Cerrar sesión</button>
          </div>
        </div>
      </header>
      <main class="p-4 sm:p-7"><slot /></main>
    </div>

    <div v-if="drawerOpen" role="dialog" aria-modal="true" aria-label="Navegación" class="fixed inset-0 z-40 lg:hidden">
      <button class="absolute inset-0 bg-black/40" aria-label="Cerrar navegación" @click="closeDrawer" />
      <aside class="relative h-full w-72 bg-[var(--color-sidebar)] p-5 text-white shadow-xl">
        <div class="flex items-center justify-between"><span class="font-semibold">ISFD N.º 9133</span><button type="button" aria-label="Cerrar navegación" class="rounded p-2" @click="closeDrawer"><X class="size-5" /></button></div>
        <nav class="mt-8" aria-label="Navegación principal">
          <RouterLink v-for="item in navItems" :key="item.name" :to="{ name: item.name }" class="mb-2 flex min-h-11 items-center gap-3 rounded-md px-3 py-2 hover:bg-white/15" :class="isNavItemActive(item.name) ? 'bg-white/20 font-semibold' : ''" :aria-current="isNavItemActive(item.name) ? 'page' : undefined" @click="closeDrawer"><component :is="item.icon" class="size-5" />{{ item.label }}</RouterLink>
        </nav>
      </aside>
    </div>
    <ConfirmDialog :open="confirmLogoutOpen" title="Cerrar sesión" description="Tendrás que ingresar nuevamente para continuar." confirm-label="Cerrar sesión" :loading="loggingOut" @cancel="confirmLogoutOpen = false" @confirm="logout" />
  </div>
</template>
