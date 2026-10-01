<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Component } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { BadgeCheck, BookOpen, CalendarDays, ClipboardList, FileText, GraduationCap, UserRound, Users } from 'lucide-vue-next'
import type { Role } from '@/core/auth/contracts'
import { useAuthStore } from '@/stores/authStore'
import { useCareerSelectionStore } from '@/stores/careerSelectionStore'
import ModuleAccessCard from '../components/ModuleAccessCard.vue'
import StudentProgressCard from '../components/StudentProgressCard.vue'
import AppButton from '@/ui/AppButton.vue'
import { fetchStudentCareers, fetchStudentTrajectory, progressFromTrajectory } from '../api/homeApi'
import type { StudentCareer, StudentTrajectory } from '../types/home'
import { fetchMyExamEnrollments } from '@/modules/exams/api/examsApi'
import type { ExamEnrollment } from '@/modules/exams/types/exams'

const auth = useAuthStore()
const careerSelection = useCareerSelectionStore()
const careers = ref<StudentCareer[]>([])
const selectedCareerId = ref<number | null>(null)
const trajectory = ref<StudentTrajectory | null>(null)
const loadingCareers = ref(false)
const loadingTrajectory = ref(false)
const error = ref('')
const upcomingExams = ref<ExamEnrollment[]>([])
const loadingUpcomingExams = ref(false)
const upcomingExamsError = ref('')
let careerRequest = 0
let trajectoryRequest = 0
let upcomingExamsRequest = 0
let mounted = true
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
    { label: 'Carreras y planes', description: 'Explorá la oferta y los planes de estudio.', icon: GraduationCap, to: { name: 'student-careers' } },
    { label: 'Horarios', description: 'Consultá el horario institucional publicado.', icon: CalendarDays, to: { name: 'schedules' } },
    { label: 'Mi perfil', description: 'Revisá y actualizá tus datos personales.', icon: UserRound, to: { name: 'profile' } },
  ],
  ADMINISTRATIVO: [
    { label: 'Usuarios', description: 'Administrá cuentas, roles y estados de acceso.', icon: Users, to: { name: 'admin-users' } },
    { label: 'Trayectorias', description: 'Consultá las trayectorias académicas de los alumnos.', icon: GraduationCap, to: { name: 'admin-academic-records' } },
    { label: 'Carreras', description: 'Gestioná carreras y planes de estudio.', icon: GraduationCap, to: { name: 'admin-careers' } },
    { label: 'Inscripciones a carreras', description: 'Inscribí alumnos, consultá la nómina y gestioná bajas.', icon: ClipboardList, to: { name: 'admin-career-enrollments' } },
    { label: 'Materias', description: 'Gestioná materias, correlatividades y docentes.', icon: BookOpen, to: { name: 'admin-subjects' } },
    { label: 'Cursadas', description: 'Gestioná la oferta de cursadas.', icon: ClipboardList, to: { name: 'admin-courses' } },
    { label: 'Períodos', description: 'Gestioná períodos de inscripción.', icon: FileText, to: { name: 'admin-periods' } },
    { label: 'Mesas de examen', description: 'Gestioná mesas, tribunales y resultados.', icon: ClipboardList, to: { name: 'admin-exams' } },
    { label: 'Homologaciones', description: 'Registrá y resolvé homologaciones totales o parciales.', icon: BadgeCheck, to: { name: 'admin-homologations' } },
    { label: 'Horarios', description: 'Consultá el horario institucional publicado.', icon: CalendarDays, to: { name: 'schedules' } },
    { label: 'Mi perfil', description: 'Revisá y actualizá tus datos personales.', icon: UserRound, to: { name: 'profile' } },
  ],
  PROFESOR: [
    { label: 'Horarios', description: 'Consultá el horario institucional publicado.', icon: CalendarDays, to: { name: 'schedules' } },
    { label: 'Mi perfil', description: 'Revisá y actualizá tus datos personales.', icon: UserRound, to: { name: 'profile' } },
    { label: 'Cursadas', description: 'Consultá y gestioná tus cursadas docentes.', icon: BookOpen, to: { name: 'teacher-courses' } },
    { label: 'Calificaciones', description: 'Cargá y consultá las calificaciones de tus cursadas.', icon: ClipboardList, to: { name: 'teacher-courses', query: { seccion: 'calificaciones' } } },
    { label: 'Trayectorias', description: 'Consultá los resúmenes académicos de tus cursadas.', icon: GraduationCap, to: { name: 'teacher-courses', query: { seccion: 'resumen' } } },
    { label: 'Mis mesas', description: 'Cargá resultados de las mesas donde integrás tribunal.', icon: ClipboardList, to: { name: 'teacher-exams' } },
  ],
}

const moduleAccess = computed(() => auth.activeRole ? modulesByRole[auth.activeRole] : [])

function currentIdentity() { return { userId: auth.user?.idUsuario ?? null, role: auth.activeRole ?? null } }

const upcomingExamList = computed(() => upcomingExams.value
  .filter((exam) => {
    const timestamp = new Date(exam.fecha).getTime()
    return Number.isFinite(timestamp)
      && timestamp > Date.now()
      && exam.activo !== false
      && exam.estadoMesa !== 'FINALIZADA'
  })
  .sort((left, right) => new Date(left.fecha).getTime() - new Date(right.fecha).getTime())
  .slice(0, 3))

function formatExamDate(value: string): string {
  return new Date(value).toLocaleString('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

async function loadUpcomingExams(): Promise<void> {
  const snapshot = currentIdentity()
  const request = ++upcomingExamsRequest
  if (snapshot.userId === null || snapshot.role !== 'ALUMNO') {
    upcomingExams.value = []
    loadingUpcomingExams.value = false
    upcomingExamsError.value = ''
    return
  }
  loadingUpcomingExams.value = true
  upcomingExamsError.value = ''
  try {
    const result = await fetchMyExamEnrollments(snapshot.userId)
    if (!mounted || request !== upcomingExamsRequest || currentIdentity().userId !== snapshot.userId || currentIdentity().role !== snapshot.role) return
    upcomingExams.value = result
  } catch {
    if (mounted && request === upcomingExamsRequest && currentIdentity().userId === snapshot.userId && currentIdentity().role === snapshot.role) {
      upcomingExams.value = []
      upcomingExamsError.value = 'No pudimos obtener tus próximos exámenes.'
    }
  } finally {
    if (mounted && request === upcomingExamsRequest) loadingUpcomingExams.value = false
  }
}

async function loadTrajectory(careerId: number, request: number, snapshot: ReturnType<typeof currentIdentity>): Promise<void> {
  if (snapshot.userId === null || snapshot.role !== 'ALUMNO') return
  loadingTrajectory.value = true
  error.value = ''
  try {
    const result = await fetchStudentTrajectory(snapshot.userId, careerId)
    if (!mounted || request !== trajectoryRequest || currentIdentity().userId !== snapshot.userId || currentIdentity().role !== snapshot.role || selectedCareerId.value !== careerId) return
    trajectory.value = result
  } catch {
    if (mounted && request === trajectoryRequest && currentIdentity().userId === snapshot.userId && currentIdentity().role === snapshot.role && selectedCareerId.value === careerId) {
      trajectory.value = null
      error.value = 'No pudimos obtener tu trayectoria académica. Intentá nuevamente más tarde.'
    }
  } finally {
    if (mounted && request === trajectoryRequest) loadingTrajectory.value = false
  }
}

async function loadStudentHome(): Promise<void> {
  const snapshot = currentIdentity()
  const request = ++careerRequest
  trajectory.value = null
  selectedCareerId.value = null
  if (snapshot.userId === null || snapshot.role !== 'ALUMNO') {
    careers.value = []
    loadingCareers.value = false
    return
  }
  loadingCareers.value = true
  error.value = ''
  try {
    // The backend may return historical enrollments; students should only
    // navigate through active careers whose study plan is available.
    const result = (await fetchStudentCareers(snapshot.userId))
      .filter(({ activo, carrera }) => activo !== false && carrera.activo !== false)
    if (!mounted || request !== careerRequest || currentIdentity().userId !== snapshot.userId || currentIdentity().role !== snapshot.role) return
    careers.value = result
    const saved = careerSelection.isOwnedBy(snapshot) ? careerSelection.selectedCareerId : null
    const careerId = saved !== null && result.some((career) => career.carreraId === saved) ? saved : result[0]?.carreraId ?? null
    selectedCareerId.value = careerId
    if (careerId !== null) {
      careerSelection.selectCareer(careerId, snapshot)
    } else careerSelection.clear()
  } catch {
    if (mounted && request === careerRequest && currentIdentity().userId === snapshot.userId && currentIdentity().role === snapshot.role) {
      careers.value = []
      error.value = 'No pudimos obtener tus carreras inscriptas. Intentá nuevamente más tarde.'
    }
  } finally {
    if (mounted && request === careerRequest) loadingCareers.value = false
  }
}

watch(selectedCareerId, (careerId, previous) => {
  const snapshot = currentIdentity()
  if (careerId === previous || careerId === null || snapshot.userId === null || snapshot.role !== 'ALUMNO') return
  careerSelection.selectCareer(careerId, snapshot)
  const request = ++trajectoryRequest
  void loadTrajectory(careerId, request, snapshot)
})
watch(() => [auth.user?.idUsuario ?? null, auth.activeRole ?? null], ([userId, role], previous) => {
  if (userId !== previous[0] || role !== previous[1]) {
    void loadStudentHome()
    void loadUpcomingExams()
  }
})
onMounted(() => {
  if (isStudent.value) {
    void loadStudentHome()
    void loadUpcomingExams()
  }
})
onUnmounted(() => { mounted = false; careerRequest++; trajectoryRequest++; upcomingExamsRequest++ })
</script>

<template>
  <main aria-labelledby="home-title" class="mx-auto max-w-5xl">
    <p class="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--color-brand)]">Intranet institucional</p>
    <h1 id="home-title" class="mt-2 text-3xl font-semibold text-[var(--color-text)]">Bienvenido/a, {{ auth.user?.apellidoNombre }}</h1>

    <section v-if="isStudent" class="mt-8" aria-live="polite">
      <div v-if="loadingCareers" role="status" class="rounded-lg border border-[var(--color-border)] bg-white p-5 text-[var(--color-graphite)]">Cargando tu trayectoria académica…</div>
      <div v-else-if="error" role="alert" class="rounded-md border border-[#edb8b8] bg-[#fff4f4] p-4 text-[#8b151b]"><p>{{ error }}</p><AppButton class="mt-3" variant="secondary" @click="loadStudentHome">Reintentar</AppButton></div>
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

    <section v-if="isStudent" class="mt-8" aria-labelledby="upcoming-exams-title">
      <div class="rounded-lg border border-[var(--color-border)] bg-white p-5">
        <h2 id="upcoming-exams-title" class="text-xl font-semibold text-[var(--color-text)]">Próximos exámenes</h2>
        <div v-if="loadingUpcomingExams" role="status" class="mt-4 text-[var(--color-graphite)]">Cargando próximos exámenes…</div>
        <div v-else-if="upcomingExamsError" role="alert" class="mt-4 rounded-md border border-[#edb8b8] bg-[#fff4f4] p-4 text-[#8b151b]"><p>{{ upcomingExamsError }}</p><AppButton class="mt-3" variant="secondary" @click="loadUpcomingExams">Reintentar</AppButton></div>
        <div v-else-if="!upcomingExamList.length" class="mt-4 text-[var(--color-graphite)]">No tenés próximos exámenes. <RouterLink :to="{ name: 'student-exams' }" class="font-semibold text-[var(--color-brand)] hover:underline">Ver mis exámenes</RouterLink></div>
        <div v-else>
          <ul class="mt-4 divide-y divide-[var(--color-border)]" aria-label="Próximos exámenes"><li v-for="exam in upcomingExamList" :key="exam.id" class="py-3 first:pt-0 last:pb-0"><p class="font-semibold">{{ exam.materia.nombre }}</p><p class="mt-1 text-sm text-[var(--color-graphite)]">{{ formatExamDate(exam.fecha) }} · {{ exam.llamado === undefined ? 'Llamado no informado' : `Llamado ${exam.llamado}` }}</p><p class="text-sm text-[var(--color-graphite)]">Condición: {{ exam.condicion === 'REGULAR' ? 'Regular' : 'Libre' }}</p></li></ul>
          <RouterLink :to="{ name: 'student-exams' }" class="mt-4 inline-block font-semibold text-[var(--color-brand)] hover:underline">Ver mis exámenes</RouterLink>
        </div>
      </div>
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
