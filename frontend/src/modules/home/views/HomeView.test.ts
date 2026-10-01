import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { render, screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { useCareerSelectionStore } from '@/stores/careerSelectionStore'
import HomeView from './HomeView.vue'
import { fetchStudentCareers, fetchStudentTrajectory } from '../api/homeApi'
import { fetchMyExamEnrollments } from '@/modules/exams/api/examsApi'

const state = vi.hoisted(() => ({ activeRole: 'ALUMNO', user: { idUsuario: 13, apellidoNombre: 'Lucía Test' } }))
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => state }))
vi.mock('../api/homeApi', () => ({
  fetchStudentCareers: vi.fn().mockResolvedValue([{ id: 7, carreraId: 3, carrera: { id: 3, nombre: 'Profesorado', materias: [{ id: 1 }, { id: 2 }] } }]),
  fetchStudentTrajectory: vi.fn().mockResolvedValue({ cantidadMateriasAprobadas: 1, promedioGeneral: 8, materias: [{}, {}] }),
  progressFromTrajectory: vi.fn().mockReturnValue({ approved: 1, total: 2, percent: 50 }),
}))
vi.mock('@/modules/exams/api/examsApi', () => ({ fetchMyExamEnrollments: vi.fn() }))

const RouterLink = defineComponent({
  props: { to: { type: Object, required: true } },
  setup(props, { slots }) {
    return () => {
      const name = (props.to as { name?: string }).name
      const paths: Record<string, string> = {
        'academic-record': '/app/alumno/trayectoria',
        'subject-enrollments': '/app/alumno/materias',
        'student-exams': '/app/alumno/examenes',
        'student-careers': '/app/alumno/carreras',
        schedules: '/app/horarios',
        profile: '/app/perfil',
      }
      return h('a', {
        href: paths[name ?? ''] ?? '#',
        'data-route-name': name,
        'data-route-query': JSON.stringify((props.to as { query?: Record<string, string> }).query ?? {}),
      }, slots.default?.())
    }
  },
})

const renderHome = () => render(HomeView, { global: { stubs: { RouterLink } } })

const studentModules = [
  ['Trayectoria', 'Consultá tus materias y tu progreso académico.', 'academic-record'],
  ['Mis materias', 'Gestioná tus inscripciones a cursadas.', 'subject-enrollments'],
  ['Carreras y planes', 'Explorá la oferta y los planes de estudio.', 'student-careers'],
  ['Horarios', 'Consultá el horario institucional publicado.', 'schedules'],
  ['Mi perfil', 'Revisá y actualizá tus datos personales.', 'profile'],
] as const

const administratorModules = [
  ['Usuarios', 'Administrá cuentas, roles y estados de acceso.', 'admin-users'],
  ['Trayectorias', 'Consultá las trayectorias académicas de los alumnos.', 'admin-academic-records'],
  ['Carreras', 'Gestioná carreras y planes de estudio.', 'admin-careers'],
  ['Inscripciones a carreras', 'Inscribí alumnos, consultá la nómina y gestioná bajas.', 'admin-career-enrollments'],
  ['Materias', 'Gestioná materias, correlatividades y docentes.', 'admin-subjects'],
  ['Cursadas', 'Gestioná la oferta de cursadas.', 'admin-courses'],
  ['Períodos', 'Gestioná períodos de inscripción.', 'admin-periods'],
  ['Mesas de examen', 'Gestioná mesas, tribunales y resultados.', 'admin-exams'],
  ['Homologaciones', 'Registrá y resolvé homologaciones totales o parciales.', 'admin-homologations'],
  ['Horarios', 'Consultá el horario institucional publicado.', 'schedules'],
  ['Mi perfil', 'Revisá y actualizá tus datos personales.', 'profile'],
] as const

const professorLinks = [
  ['Horarios', 'Consultá el horario institucional publicado.', 'schedules'],
  ['Mi perfil', 'Revisá y actualizá tus datos personales.', 'profile'],
  ['Cursadas', 'Consultá y gestioná tus cursadas docentes.', 'teacher-courses', '{}'],
  ['Calificaciones', 'Cargá y consultá las calificaciones de tus cursadas.', 'teacher-courses', '{"seccion":"calificaciones"}'],
  ['Trayectorias', 'Consultá los resúmenes académicos de tus cursadas.', 'teacher-courses', '{"seccion":"resumen"}'],
  ['Mis mesas', 'Cargá resultados de las mesas donde integrás tribunal.', 'teacher-exams', '{}'],
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
    labels: ['Trayectoria', 'Mis materias', 'Carreras y planes'],
    descriptions: [
      'Consultá tus materias y tu progreso académico.',
      'Gestioná tus inscripciones a cursadas.',
      'Explorá la oferta y los planes de estudio.',
    ],
  },
  ADMINISTRATIVO: {
    labels: ['Usuarios', 'Carreras', 'Materias', 'Períodos', 'Mesas de examen', 'Homologaciones'],
    descriptions: [
      'Administrá cuentas, roles y estados de acceso.',
      'Gestioná carreras y planes de estudio.',
      'Gestioná materias, correlatividades y docentes.',
      'Gestioná la oferta de cursadas.',
      'Gestioná períodos de inscripción.',
      'Registrá y resolvé homologaciones totales o parciales.',
    ],
  },
  PROFESOR: {
    labels: ['Calificaciones', 'Mis mesas'],
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
    setActivePinia(createPinia())
    state.activeRole = 'ALUMNO'
    vi.clearAllMocks()
    vi.mocked(fetchStudentCareers).mockResolvedValue([{ id: 7, carreraId: 3, carrera: { id: 3, nombre: 'Profesorado', materias: [{ id: 1 }, { id: 2 }] } }])
    vi.mocked(fetchStudentTrajectory).mockResolvedValue({ cantidadMateriasAprobadas: 1, promedioGeneral: 8, materias: [{}, {}] })
    vi.mocked(fetchMyExamEnrollments).mockResolvedValue([])
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

  it('shares the selected active career with the academic modules', async () => {
    vi.mocked(fetchStudentCareers).mockResolvedValueOnce([
      { id: 3, carreraId: 3, activo: true, carrera: { id: 3, nombre: 'Profesorado', activo: true, materias: [] } },
      { id: 4, carreraId: 4, activo: true, carrera: { id: 4, nombre: 'Tecnicatura', activo: true, materias: [] } },
    ])
    const user = userEvent.setup()
    renderHome()

    const career = await screen.findByLabelText('Carrera')
    await user.selectOptions(career, '4')

    expect(useCareerSelectionStore().selectedCareerId).toBe(4)
  })

  it('shows the three nearest future active exam enrollments', async () => {
    vi.mocked(fetchMyExamEnrollments).mockResolvedValueOnce([
      { id: 1, mesaId: 1, materia: { id: 1, nombre: 'Más tarde' }, fecha: '2027-12-10T12:00:00.000Z', llamado: 1, estadoMesa: 'ABIERTA', activo: true, condicion: 'REGULAR', estadoResultado: 'PENDIENTE', nota: null, aprobado: null, notaMinima: 6 },
      { id: 2, mesaId: 2, materia: { id: 2, nombre: 'Primera' }, fecha: '2027-10-10T12:00:00.000Z', llamado: 2, estadoMesa: 'ABIERTA', activo: true, condicion: 'LIBRE', estadoResultado: 'PENDIENTE', nota: null, aprobado: null, notaMinima: 6 },
      { id: 3, mesaId: 3, materia: { id: 3, nombre: 'Segunda' }, fecha: '2027-11-10T12:00:00.000Z', llamado: 1, estadoMesa: 'EN_PROCESO', activo: true, condicion: 'REGULAR', estadoResultado: 'EN_REVISION', nota: null, aprobado: null, notaMinima: 6 },
      { id: 4, mesaId: 4, materia: { id: 4, nombre: 'Cuarta' }, fecha: '2027-12-01T12:00:00.000Z', llamado: 1, estadoMesa: 'ABIERTA', activo: true, condicion: 'REGULAR', estadoResultado: 'PENDIENTE', nota: null, aprobado: null, notaMinima: 6 },
      { id: 5, mesaId: 5, materia: { id: 5, nombre: 'Finalizada' }, fecha: '2027-09-10T12:00:00.000Z', llamado: 1, estadoMesa: 'FINALIZADA', activo: true, condicion: 'REGULAR', estadoResultado: 'CALIFICADO', nota: 8, aprobado: true, notaMinima: 6 },
      { id: 6, mesaId: 6, materia: { id: 6, nombre: 'Pasada' }, fecha: '2026-01-10T12:00:00.000Z', llamado: 1, estadoMesa: 'ABIERTA', activo: true, condicion: 'REGULAR', estadoResultado: 'PENDIENTE', nota: null, aprobado: null, notaMinima: 6 },
    ])

    renderHome()

    const list = await screen.findByRole('list', { name: 'Próximos exámenes' })
    expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Primera'), expect.stringContaining('Segunda'), expect.stringContaining('Cuarta')]))
    expect(within(list).queryByText('Más tarde')).not.toBeInTheDocument()
    expect(within(list).queryByText('Finalizada')).not.toBeInTheDocument()
    expect(within(list).queryByText('Pasada')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver mis exámenes' })).toHaveAttribute('data-route-name', 'student-exams')
  })

  it('shows the complete student access matrix and preserves its progress requests', async () => {
    renderHome()
    await screen.findByText('1 de 2 materias aprobadas')

    expect(screen.getByRole('heading', { level: 2, name: launcherTitles.ALUMNO })).toBeVisible()
    expect(screen.getByText(launcherCopy)).toBeVisible()
    expect(screen.queryByText(professorAvailabilityCopy)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Próximos exámenes' })).toBeVisible()
    expect(screen.getByText(/No tenés próximos exámenes/)).toBeVisible()
    const moduleLinks = screen.getAllByRole('link').filter((link) => link.textContent !== 'Ver mis exámenes')
    expect(moduleLinks).toHaveLength(studentModules.length)
    expect(screen.queryAllByRole('article')).toHaveLength(0)
    expect(moduleLinks.map((link) => link.getAttribute('data-route-name'))).toEqual(studentModules.map(([, , routeName]) => routeName))
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
