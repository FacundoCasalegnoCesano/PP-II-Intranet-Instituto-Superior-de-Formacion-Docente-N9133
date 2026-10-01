import { render, screen, waitFor, within } from '@testing-library/vue'
import { flushPromises } from '@vue/test-utils'
import userEvent from '@testing-library/user-event'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, reactive } from 'vue'
import AdminAcademicRecordsView from './AdminAcademicRecordsView.vue'

const mocks = vi.hoisted(() => ({
  fetchAdminStudents: vi.fn(), fetchAdminStudent: vi.fn(), fetchAdminStudentCareers: vi.fn(), fetchAdminStudentTrajectory: vi.fn(), fetchAllAdminCareers: vi.fn(),
  auth: { status: 'authenticated', activeRole: 'ADMINISTRATIVO', user: { idUsuario: 99 } },
}))
vi.mock('../api/adminAcademicRecordsApi', () => mocks)
const authState = reactive(mocks.auth)
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => authState }))

const activeCareer = { id: 3, nombre: 'Profesorado de Inglés', duracionAnios: 4, activo: true }
const historicalCareer = { id: 2, nombre: 'Profesorado de Historia', duracionAnios: 4, activo: false }
const student = { idUsuario: 13, apellidoNombre: 'Lucía Test Fernández', dni: '42666888', activo: false, email: 'lucia@instituto.edu.ar' }
const trajectory = { alumnoUsuarioId: 13, carrera: { id: 3, nombre: activeCareer.nombre, duracionAnios: 4 }, promedioGeneral: 8.5, cantidadMateriasAprobadas: 1, materias: [{ materia: { id: 14, nombre: 'Álgebra y Geometría' }, plan: { anio: 1 }, estado: 'APROBADA', asistencia: { porcentaje: 91 }, parcialesEfectivos: [{ numero: 1, nota: 8 }], regularidad: { vencida: false, hasta: '2027-12-31' }, homologacion: null, definitiva: { nota: 8, via: 'EXAMEN_FINAL' } }] }

function createRouterAt(path: string) {
  return createRouter({ history: createMemoryHistory(), routes: [
    { path: '/app/administracion/trayectorias', name: 'admin-academic-records', component: AdminAcademicRecordsView },
    { path: '/app/administracion/trayectorias/:id', name: 'admin-academic-record-detail', component: AdminAcademicRecordsView },
  ] })
}

async function renderAt(path = '/app/administracion/trayectorias') {
  const router = createRouterAt(path)
  await router.push(path); await router.isReady()
  render(defineComponent({ render: () => h(RouterView) }), { global: { plugins: [router] } })
  return router
}

beforeEach(() => {
  vi.clearAllMocks()
  authState.status = 'authenticated'; authState.activeRole = 'ADMINISTRATIVO'; authState.user = { idUsuario: 99 }
  mocks.fetchAllAdminCareers.mockResolvedValue([activeCareer, historicalCareer])
  mocks.fetchAdminStudents.mockResolvedValue({ data: [student], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } })
  mocks.fetchAdminStudent.mockResolvedValue(student)
  mocks.fetchAdminStudentCareers.mockResolvedValue([{ id: 10, carreraId: 3, activo: true, carrera: activeCareer }, { id: 11, carreraId: 2, activo: false, carrera: historicalCareer }])
  mocks.fetchAdminStudentTrajectory.mockResolvedValue(trajectory)
})

describe('AdminAcademicRecordsView', () => {
  it('permite buscar y filtrar sin perder la paginación en la URL', async () => {
    const router = await renderAt('/app/administracion/trayectorias?page=2')
    await screen.findAllByRole('link', { name: 'Lucía Test Fernández' })
    await userEvent.setup().type(screen.getByLabelText('Alumno'), '42666888')
    await userEvent.setup().selectOptions(screen.getByLabelText('Carrera'), '2')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(router.currentRoute.value.query).toMatchObject({ search: '42666888', carreraId: '2' }))
    expect(router.currentRoute.value.query.page).toBeUndefined()
    expect(mocks.fetchAdminStudents).toHaveBeenLastCalledWith({ search: '42666888', carreraId: 2, page: 1, limit: 20 })
  })

  it('mantiene los filtros al abrir detalle y consulta identidad, carreras históricas y trayectoria', async () => {
    const router = await renderAt('/app/administracion/trayectorias/13?search=Luc%C3%ADa&page=2&carreraId=2')
    expect(await screen.findByRole('heading', { name: 'Lucía Test Fernández' })).toBeVisible()
    expect(screen.getByText('Cuenta inactiva')).toBeVisible()
    expect(screen.getByText('Promedio general')).toBeVisible()
    expect(screen.getByText('Álgebra y Geometría')).toBeVisible()
    expect(mocks.fetchAdminStudent).toHaveBeenCalledWith(13)
    expect(mocks.fetchAdminStudentCareers).toHaveBeenCalledWith(13)
    expect(mocks.fetchAdminStudentTrajectory).toHaveBeenCalledWith(13, 3)
    const back = screen.getByRole('link', { name: 'Volver al listado' })
    expect(back).toHaveAttribute('href', '/app/administracion/trayectorias?search=Luc%C3%ADa&carreraId=2&page=2')
    await userEvent.setup().selectOptions(screen.getByRole('combobox'), '2')
    await waitFor(() => expect(mocks.fetchAdminStudentTrajectory).toHaveBeenLastCalledWith(13, 2))
    expect(router.currentRoute.value.query.selectedCareerId).toBe('2')
  })

  it('muestra error y limpia los resultados si falla una carga', async () => {
    mocks.fetchAdminStudents.mockRejectedValueOnce(new Error('network'))
    mocks.fetchAllAdminCareers.mockRejectedValueOnce(new Error('network'))
    await renderAt()
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar el listado de alumnos.')
    expect(screen.queryByText('Lucía Test Fernández')).toBeNull()
  })

  it('expone estado vacío cuando el alumno no tiene carreras, sin pedir una trayectoria inválida', async () => {
    mocks.fetchAdminStudentCareers.mockResolvedValueOnce([])
    await renderAt('/app/administracion/trayectorias/13')
    expect(await screen.findByText('El alumno no tiene inscripciones a carreras registradas.')).toBeVisible()
    expect(mocks.fetchAdminStudentTrajectory).not.toHaveBeenCalled()
  })

  it('usa filtros aplicados al abrir detalle aunque el formulario tenga cambios pendientes', async () => {
    const router = await renderAt('/app/administracion/trayectorias?search=Aplicada&carreraId=3&page=2')
    await screen.findAllByRole('link', { name: 'Lucía Test Fernández' })
    await userEvent.setup().selectOptions(screen.getByLabelText('Carrera'), '2')
    const href = screen.getAllByRole('link', { name: 'Lucía Test Fernández' })[0]?.getAttribute('href')
    expect(href).toBe('/app/administracion/trayectorias/13?search=Aplicada&carreraId=3&page=2')
    expect(router.currentRoute.value.query.search).toBe('Aplicada')
  })

  it('descarta respuestas fuera de orden al cambiar de alumno y de carrera', async () => {
    let resolveOldStudent!: (value: typeof student) => void
    const otherStudent = { ...student, idUsuario: 14, apellidoNombre: 'Otro alumno' }
    let firstStudentRequest = true
    mocks.fetchAdminStudent.mockImplementation((id: number) => {
      if (id === 13 && firstStudentRequest) {
        firstStudentRequest = false
        return new Promise((resolve) => { resolveOldStudent = resolve })
      }
      return Promise.resolve(id === 13 ? student : otherStudent)
    })
    const router = await renderAt('/app/administracion/trayectorias/13')
    await router.push('/app/administracion/trayectorias/14')
    await waitFor(() => expect(mocks.fetchAdminStudent).toHaveBeenCalledWith(14))
    expect(await screen.findByRole('heading', { name: 'Otro alumno' })).toBeVisible()
    resolveOldStudent(student)
    await flushPromises()
    expect(screen.queryByRole('heading', { name: 'Lucía Test Fernández' })).toBeNull()

    await router.push('/app/administracion/trayectorias/13')
    await screen.findByRole('heading', { name: 'Lucía Test Fernández' })
    let resolveOldTrajectory!: (value: typeof trajectory) => void
    mocks.fetchAdminStudentTrajectory.mockImplementationOnce(() => new Promise((resolve) => { resolveOldTrajectory = resolve }))
    await userEvent.setup().selectOptions(screen.getByRole('combobox'), '2')
    await waitFor(() => expect(mocks.fetchAdminStudentTrajectory).toHaveBeenCalledWith(13, 2))
    await router.push('/app/administracion/trayectorias/13?selectedCareerId=3')
    await waitFor(() => expect(mocks.fetchAdminStudentTrajectory).toHaveBeenCalledWith(13, 3))
    resolveOldTrajectory(trajectory)
    await flushPromises()
    expect(screen.getByRole('heading', { name: activeCareer.nombre })).toBeVisible()
    expect(router.currentRoute.value.query.selectedCareerId).toBe('3')
  })

  it('invalida la carga anterior cuando cambia la sesión activa', async () => {
    let resolveStudent!: (value: typeof student) => void
    const sessionStudent = { ...student, apellidoNombre: 'Alumno de la sesión nueva' }
    mocks.fetchAdminStudent
      .mockReturnValueOnce(new Promise((resolve) => { resolveStudent = resolve }))
      .mockResolvedValueOnce(sessionStudent)
    await renderAt('/app/administracion/trayectorias/13')
    authState.user = { idUsuario: 100 }; authState.activeRole = 'ADMINISTRATIVO'
    await waitFor(() => expect(mocks.fetchAdminStudent).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('heading', { name: 'Alumno de la sesión nueva' })).toBeVisible()
    resolveStudent(student)
    await flushPromises()
    expect(screen.queryByRole('heading', { name: 'Lucía Test Fernández' })).toBeNull()
  })
})
