import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { render, screen } from '@testing-library/vue'
import HomeView from './HomeView.vue'
import { fetchStudentCareers, fetchStudentTrajectory } from '../api/homeApi'

const state = vi.hoisted(() => ({ activeRole: 'ALUMNO', user: { idUsuario: 13, apellidoNombre: 'Lucía Test' } }))
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => state }))
vi.mock('../api/homeApi', () => ({
  fetchStudentCareers: vi.fn().mockResolvedValue([{ id: 7, carreraId: 3, carrera: { id: 3, nombre: 'Profesorado', materias: [{ id: 1 }, { id: 2 }] } }]),
  fetchStudentTrajectory: vi.fn().mockResolvedValue({ cantidadMateriasAprobadas: 1, promedioGeneral: 8, materias: [{}, {}] }),
  progressFromTrajectory: vi.fn().mockReturnValue({ approved: 1, total: 2, percent: 50 }),
}))

const RouterLink = defineComponent({
  props: { to: { type: Object, required: true } },
  setup(props, { slots }) {
    return () => h('a', {
      'data-route-name': (props.to as { name?: string }).name,
      'data-route-query': JSON.stringify((props.to as { query?: Record<string, string> }).query ?? {}),
    }, slots.default?.())
  },
})

const renderHome = () => render(HomeView, { global: { stubs: { RouterLink } } })

const studentModules = [
  ['Trayectoria', 'Consultá tus materias y tu progreso académico.', 'academic-record'],
  ['Mis materias', 'Gestioná tus inscripciones a cursadas.', 'subject-enrollments'],
  ['Exámenes', 'Consultá mesas y tus inscripciones a examen.', 'student-exams'],
  ['Carreras y planes', 'Explorá la oferta y los planes de estudio.', 'student-careers'],
  ['Horarios', 'Consultá el horario institucional publicado.', 'schedules'],
  ['Mi perfil', 'Revisá y actualizá tus datos personales.', 'profile'],
] as const

const administratorModules = [
  ['Usuarios', 'Administrá cuentas, roles y estados de acceso.', 'admin-users'],
  ['Carreras', 'Gestioná carreras y planes de estudio.', 'admin-careers'],
  ['Materias', 'Gestioná materias, correlatividades y docentes.', 'admin-subjects'],
  ['Cursadas', 'Gestioná la oferta de cursadas.', 'admin-courses'],
  ['Períodos', 'Gestioná períodos de inscripción.', 'admin-periods'],
  ['Horarios', 'Consultá el horario institucional publicado.', 'schedules'],
  ['Mi perfil', 'Revisá y actualizá tus datos personales.', 'profile'],
] as const

const professorLinks = [
  ['Horarios', 'Consultá el horario institucional publicado.', 'schedules'],
  ['Mi perfil', 'Revisá y actualizá tus datos personales.', 'profile'],
  ['Cursadas', 'Consultá y gestioná tus cursadas docentes.', 'teacher-courses', '{}'],
  ['Calificaciones', 'Cargá y consultá las calificaciones de tus cursadas.', 'teacher-courses', '{"seccion":"calificaciones"}'],
  ['Trayectorias', 'Consultá los resúmenes académicos de tus cursadas.', 'teacher-courses', '{"seccion":"resumen"}'],
] as const

const launcherTitles = {
  ALUMNO: 'Accesos académicos',
  ADMINISTRATIVO: 'Gestión institucional',
  PROFESOR: 'Herramientas docentes',
} as const

const launcherCopy = 'Accedé a los módulos disponibles para tu rol.'
const professorAvailabilityCopy = 'Las tarjetas marcadas como Próximamente aún no están habilitadas.'

const exclusiveContentByRole = {
  ALUMNO: {
    labels: ['Trayectoria', 'Mis materias', 'Exámenes', 'Carreras y planes'],
    descriptions: [
      'Consultá tus materias y tu progreso académico.',
      'Gestioná tus inscripciones a cursadas.',
      'Consultá mesas y tus inscripciones a examen.',
      'Explorá la oferta y los planes de estudio.',
    ],
  },
  ADMINISTRATIVO: {
    labels: ['Usuarios', 'Carreras', 'Materias', 'Períodos'],
    descriptions: [
      'Administrá cuentas, roles y estados de acceso.',
      'Gestioná carreras y planes de estudio.',
      'Gestioná materias, correlatividades y docentes.',
      'Gestioná la oferta de cursadas.',
      'Gestioná períodos de inscripción.',
    ],
  },
  PROFESOR: {
    labels: ['Calificaciones', 'Trayectorias'],
    descriptions: [
      'Cargá y consultá las calificaciones de tus cursadas.',
      'Consultá los resúmenes académicos de tus cursadas.',
    ],
  },
} as const

type HomeRole = keyof typeof exclusiveContentByRole

function expectNoCrossRoleContent(role: HomeRole) {
  for (const otherRole of Object.keys(exclusiveContentByRole) as HomeRole[]) {
    if (otherRole === role) continue
    for (const label of exclusiveContentByRole[otherRole].labels) {
      expect(screen.queryByText(label, { exact: true })).not.toBeInTheDocument()
    }
    for (const description of exclusiveContentByRole[otherRole].descriptions) {
      expect(screen.queryByText(description, { exact: true })).not.toBeInTheDocument()
    }
  }
}

describe('HomeView', () => {
  beforeEach(() => {
    state.activeRole = 'ALUMNO'
    vi.clearAllMocks()
    vi.mocked(fetchStudentCareers).mockResolvedValue([{ id: 7, carreraId: 3, carrera: { id: 3, nombre: 'Profesorado', materias: [{ id: 1 }, { id: 2 }] } }])
    vi.mocked(fetchStudentTrajectory).mockResolvedValue({ cantidadMateriasAprobadas: 1, promedioGeneral: 8, materias: [{}, {}] })
  })

  it('shows real student career progress and average', async () => {
    renderHome()
    expect(await screen.findByText('1 de 2 materias aprobadas')).toBeVisible()
    expect(screen.getByText('Promedio general: 8')).toBeVisible()
    expect(screen.getByLabelText('Carrera')).toBeVisible()
  })

  it('selects the first active career when the account has an inactive enrollment', async () => {
    vi.mocked(fetchStudentCareers).mockResolvedValueOnce([
      { id: 4, carreraId: 2, carrera: { id: 2, nombre: 'Carrera inactiva', activo: false, materias: [] } },
      { id: 3, carreraId: 3, carrera: { id: 3, nombre: 'Carrera activa', activo: true, materias: [{ id: 1 }] } },
    ])

    renderHome()

    expect(await screen.findByRole('option', { name: 'Carrera activa', selected: true })).toBeVisible()
  })

  it('shows the complete student access matrix and preserves its progress requests', async () => {
    renderHome()
    await screen.findByText('1 de 2 materias aprobadas')

    expect(screen.getByRole('heading', { level: 2, name: launcherTitles.ALUMNO })).toBeVisible()
    expect(screen.getByText(launcherCopy)).toBeVisible()
    expect(screen.queryByText(professorAvailabilityCopy)).not.toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(studentModules.length)
    expect(screen.queryAllByRole('article')).toHaveLength(0)
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('data-route-name'))).toEqual(studentModules.map(([, , routeName]) => routeName))
    for (const [label, description, routeName] of studentModules) {
      expect(screen.getByRole('link', { name: new RegExp(label) })).toHaveAttribute('data-route-name', routeName)
      expect(screen.getByText(description)).toBeVisible()
    }
    expect(fetchStudentCareers).toHaveBeenCalledTimes(1)
    expect(fetchStudentTrajectory).toHaveBeenCalledTimes(1)
    expectNoCrossRoleContent('ALUMNO')
  })

  it('shows the complete administrative access matrix without student progress requests', () => {
    state.activeRole = 'ADMINISTRATIVO'
    renderHome()

    expect(screen.getByRole('heading', { level: 2, name: launcherTitles.ADMINISTRATIVO })).toBeVisible()
    expect(screen.getByText(launcherCopy)).toBeVisible()
    expect(screen.queryByText(professorAvailabilityCopy)).not.toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(administratorModules.length)
    expect(screen.queryAllByRole('article')).toHaveLength(0)
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('data-route-name'))).toEqual(administratorModules.map(([, , routeName]) => routeName))
    for (const [label, description, routeName] of administratorModules) {
      expect(screen.getByRole('link', { name: new RegExp(label) })).toHaveAttribute('data-route-name', routeName)
      expect(screen.getByText(description)).toBeVisible()
    }
    expect(fetchStudentCareers).not.toHaveBeenCalled()
    expect(fetchStudentTrajectory).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Carrera')).not.toBeInTheDocument()
    expectNoCrossRoleContent('ADMINISTRATIVO')
  })

  it('shows only professor routes with functional teacher-course cards', () => {
    state.activeRole = 'PROFESOR'
    renderHome()

    expect(screen.getByRole('heading', { level: 2, name: launcherTitles.PROFESOR })).toBeVisible()
    expect(screen.getByText(launcherCopy)).toBeVisible()
    expect(screen.queryByText(professorAvailabilityCopy)).not.toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(professorLinks.length)
    expect(screen.queryAllByRole('article')).toHaveLength(0)
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('data-route-name'))).toEqual(professorLinks.map(([, , routeName]) => routeName))
    for (const [label, description, routeName, query = '{}'] of professorLinks) {
      expect(screen.getByRole('link', { name: new RegExp(label) })).toHaveAttribute('data-route-name', routeName)
      expect(screen.getByRole('link', { name: new RegExp(label) })).toHaveAttribute('data-route-query', query)
      expect(screen.getByText(description)).toBeVisible()
    }
    expect(fetchStudentCareers).not.toHaveBeenCalled()
    expect(fetchStudentTrajectory).not.toHaveBeenCalled()
    expectNoCrossRoleContent('PROFESOR')
  })
})
