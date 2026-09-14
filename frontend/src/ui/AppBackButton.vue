<script setup lang="ts">
import { ArrowLeft } from 'lucide-vue-next'
import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router'
import type { Role } from '@/core/auth/contracts'
import { useAuthStore } from '@/stores/authStore'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

function fallbackDestination(): RouteLocationRaw {
  const name = String(route.name ?? '')
  if (name.startsWith('teacher-course-')) {
    return { name: 'teacher-courses', query: { anioLectivo: route.query.anioLectivo } }
  }
  if (name.startsWith('teacher-exam-')) return { name: 'teacher-exams', query: route.query }
  const adminLists: Record<string, string> = {
    'admin-user-': 'admin-users',
    'admin-career-': 'admin-careers',
    'admin-subject-': 'admin-subjects',
    'admin-course-': 'admin-courses',
    'admin-period-': 'admin-periods',
    'admin-exam-': 'admin-exams',
  }
  for (const [prefix, list] of Object.entries(adminLists)) {
    if (!name.startsWith(prefix)) continue
    if (name.endsWith('-edit')) return { name: `${prefix}detail`, params: { id: route.params.id }, query: route.query }
    return { name: list, query: route.query }
  }
  return { name: 'home' }
}

function goBack(): void {
  const back = router.options.history.state.back
  if (typeof back === 'string' && back.startsWith('/app/')) {
    const previous = router.resolve(back)
    const roles = previous.meta.allowedRoles as Role[] | undefined
    const allowed = !roles?.length || Boolean(auth.activeRole && roles.includes(auth.activeRole))
    if (previous.matched.length && previous.meta.requiresSession && !previous.meta.roleSelection
      && allowed && previous.fullPath.split('#')[0] !== route.fullPath.split('#')[0]) {
      router.back()
      return
    }
  }
  void router.replace(fallbackDestination())
}
</script>

<template>
  <button v-if="route.name !== 'home'" type="button" class="mb-4 inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-semibold text-[var(--color-brand)] hover:border-[var(--color-brand)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand)]" @click="goBack">
    <ArrowLeft class="size-4" aria-hidden="true" />Volver
  </button>
</template>
