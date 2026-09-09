<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { Component } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { BookOpen, CalendarDays, ClipboardList, FileText, GraduationCap, UserRound, Users } from 'lucide-vue-next'
import type { Role } from '@/core/auth/contracts'
import { useAuthStore } from '@/stores/authStore'
import ModuleAccessCard from '../components/ModuleAccessCard.vue'
import StudentProgressCard from '../components/StudentProgressCard.vue'
import { fetchStudentCareers, fetchStudentTrajectory, progressFromTrajectory } from '../api/homeApi'
import type { StudentCareer, StudentTrajectory } from '../types/home'

const auth = useAuthStore()
const careers = ref<StudentCareer[]>([])
const selectedCareerId = ref<number | null>(null)
const trajectory = ref<StudentTrajectory | null>(null)
const loadingCareers = ref(false)
const loadingTrajectory = ref(false)
const error = ref('')
const isStudent = computed(() => auth.activeRole === 'ALUMNO')
const progress = computed(() => trajectory.value ? progressFromTrajectory(trajectory.value) : null)
const selectedCareer = computed(() => careers.value.find(({ carreraId }) => carreraId === selectedCareerId.value)?.carrera)
const launcherTitles: Record<Role, string> = {
  ALUMNO: 'Accesos académicos',
  ADMINISTRATIVO: 'Gestión institucional',
  PROFESOR: 'Herramientas docentes',
}
const launcherTitle = computed(() => auth.activeRole ? launcherTitles[auth.activeRole] : '')

interface ModuleAccess {
  label: string
  description: string
  icon: Component
  to?: RouteLocationRaw
  status?: string
}

const modulesByRole: Record<Role, ModuleAccess[]> = {
  ALUMNO: [
    { label: 'Trayectoria', description: 'Consultá tus materias y tu progreso académico.', icon: GraduationCap, to: { name: 'academic-record' } },
    { label: 'Mis materias', description: 'Gestioná tus inscripciones a cursadas.', icon: BookOpen, to: { name: 'subject-enrollments' } },
    { label: 'Exámenes', description: 'Consultá mesas y tus inscripciones a examen.', icon: ClipboardList, to: { name: 'student-exams' } },
    { label: 'Carreras y planes', description: 'Explorá la oferta y los planes de estudio.', icon: GraduationCap, to: { name: 'student-careers' } },
    { label: 'Horarios', description: 'Consultá el horario institucional publicado.', icon: CalendarDays, to: { name: 'schedules' } },
    { label: 'Mi perfil', description: 'Revisá y actualizá tus datos personales.', icon: UserRound, to: { name: 'profile' } },
  ],
  ADMINISTRATIVO: [
    { label: 'Usuarios', description: 'Administrá cuentas, roles y estados de acceso.', icon: Users, to: { name: 'admin-users' } },
    { label: 'Carreras', description: 'Gestioná carreras y planes de estudio.', icon: GraduationCap, to: { name: 'admin-careers' } },
    { label: 'Materias', description: 'Gestioná materias, correlatividades y docentes.', icon: BookOpen, to: { name: 'admin-subjects' } },
    { label: 'Cursadas', description: 'Gestioná la oferta de cursadas.', icon: ClipboardList, to: { name: 'admin-courses' } },
    { label: 'Períodos', description: 'Gestioná períodos de inscripción.', icon: FileText, to: { name: 'admin-periods' } },
    { label: 'Horarios', description: 'Consultá el horario institucional publicado.', icon: CalendarDays, to: { name: 'schedules' } },
    { label: 'Mi perfil', description: 'Revisá y actualizá tus datos personales.', icon: UserRound, to: { name: 'profile' } },
  ],
  PROFESOR: [
    { label: 'Horarios', description: 'Consultá el horario institucional publicado.', icon: CalendarDays, to: { name: 'schedules' } },
    { label: 'Mi perfil', description: 'Revisá y actualizá tus datos personales.', icon: UserRound, to: { name: 'profile' } },
    { label: 'Cursadas', description: 'Consultá y gestioná tus cursadas docentes.', icon: BookOpen, to: { name: 'teacher-courses' } },
    { label: 'Calificaciones', description: 'Cargá y consultá las calificaciones de tus cursadas.', icon: ClipboardList, to: { name: 'teacher-courses', query: { seccion: 'calificaciones' } } },
    { label: 'Trayectorias', description: 'Consultá los resúmenes académicos de tus cursadas.', icon: GraduationCap, to: { name: 'teacher-courses', query: { seccion: 'resumen' } } },
  ],
}

const moduleAccess = computed(() => auth.activeRole ? modulesByRole[auth.activeRole] : [])

async function loadTrajectory(): Promise<void> {
  if (!auth.user || !selectedCareerId.value) return
  loadingTrajectory.value = true
  error.value = ''
  try {
    trajectory.value = await fetchStudentTrajectory(auth.user.idUsuario, selectedCareerId.value)
  } catch {
    trajectory.value = null
    error.value = 'No pudimos obtener tu trayectoria académica. Intentá nuevamente más tarde.'
  } finally {
    loadingTrajectory.value = false
  }
}

async function loadStudentHome(): Promise<void> {
  if (!auth.user) return
  loadingCareers.value = true
  error.value = ''
  try {
    // The backend may return historical enrollments; students should only
    // navigate through active careers whose study plan is available.
    careers.value = (await fetchStudentCareers(auth.user.idUsuario))
      .filter(({ carrera }) => carrera.activo !== false)
    selectedCareerId.value = careers.value[0]?.carreraId ?? null
  } catch {
    careers.value = []
    error.value = 'No pudimos obtener tus carreras inscriptas. Intentá nuevamente más tarde.'
  } finally {
    loadingCareers.value = false
  }
}

watch(selectedCareerId, () => void loadTrajectory())
onMounted(() => { if (isStudent.value) void loadStudentHome() })
</script>

<template>
  <main aria-labelledby="home-title" class="mx-auto max-w-5xl">
    <p class="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--color-brand)]">Intranet institucional</p>
    <h1 id="home-title" class="mt-2 text-3xl font-semibold text-[var(--color-text)]">Bienvenido/a, {{ auth.user?.apellidoNombre }}</h1>

    <section v-if="isStudent" class="mt-8" aria-live="polite">
      <div v-if="loadingCareers" role="status" class="rounded-lg border border-[var(--color-border)] bg-white p-5 text-[var(--color-graphite)]">Cargando tu trayectoria académica…</div>
      <p v-else-if="error" role="alert" class="rounded-md border border-[#edb8b8] bg-[#fff4f4] p-4 text-[#8b151b]">{{ error }}</p>
      <div v-else-if="careers.length === 0" class="rounded-lg border border-[var(--color-border)] bg-white p-5 text-[var(--color-graphite)]">Todavía no registramos una carrera activa para tu cuenta.</div>
      <template v-else>
        <div class="max-w-xl">
          <label for="career" class="mb-1.5 block font-semibold text-[var(--color-text)]">Carrera</label>
          <select id="career" v-model="selectedCareerId" class="min-h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2">
            <option v-for="career in careers" :key="career.id" :value="career.carreraId">{{ career.carrera.nombre }}</option>
          </select>
        </div>
        <div v-if="loadingTrajectory" role="status" class="mt-5 rounded-lg border border-[var(--color-border)] bg-white p-5 text-[var(--color-graphite)]">Actualizando el progreso de {{ selectedCareer?.nombre }}…</div>
        <StudentProgressCard v-else-if="trajectory && progress" class="mt-5 max-w-xl" :approved="progress.approved" :total="progress.total" :percent="progress.percent" :average="trajectory.promedioGeneral" />
      </template>
    </section>

    <section class="mt-8" aria-labelledby="launchers-title">
      <h2 id="launchers-title" class="text-xl font-semibold text-[var(--color-text)]">{{ launcherTitle }}</h2>
      <p class="mt-1 text-[var(--color-graphite)]">Accedé a los módulos disponibles para tu rol.</p>
      <div class="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ModuleAccessCard v-for="module in moduleAccess" :key="module.label" v-bind="module" />
      </div>
    </section>
  </main>
</template>
