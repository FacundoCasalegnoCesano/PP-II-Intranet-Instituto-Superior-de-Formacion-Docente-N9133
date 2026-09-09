import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminSubjectsView from './AdminSubjectsView.vue'

const mocks = vi.hoisted(() => ({
  listCareers: vi.fn(),
  listSubjects: vi.fn(),
  getSubjectsByYear: vi.fn(),
  getSubject: vi.fn(),
  getPrerequisites: vi.fn(),
  getTeachingAssignments: vi.fn(),
  listUsers: vi.fn(),
  createSubject: vi.fn(),
  updateSubject: vi.fn(),
}))

vi.mock('../api/adminApi', () => ({ adminApi: mocks }))

const careers = {
  data: [
    { id: 3, nombre: 'Profesorado de Inicial', duracionAnios: 4, activo: true },
    { id: 4, nombre: 'Profesorado de Primaria', duracionAnios: 4, activo: true },
  ],
  pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
}

const groupedSubjects = [
  {
    anio: 1,
    cantidad: 3,
    materias: [
      { id: 11, nombre: 'Pedagogía', cargaHoraria: 64, tipoEspacio: 'MATERIA', activo: true, carreraId: 3 },
      { id: 12, nombre: 'Historia de la Educación', cargaHoraria: 64, tipoEspacio: 'MATERIA', activo: true, carreraId: 3 },
      { id: 21, nombre: 'Didáctica General', cargaHoraria: 64, tipoEspacio: 'MATERIA', activo: true, carreraId: 3 },
    ],
  },
  { anio: 2, cantidad: 1, materias: [{ id: 13, nombre: 'Didáctica', cargaHoraria: 64, tipoEspacio: 'MATERIA', activo: true, carreraId: 3 }] },
]

function setupRouter(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app/administracion/materias/nueva', name: 'admin-subject-create', component: AdminSubjectsView },
      { path: '/app/administracion/materias/:id/editar', name: 'admin-subject-edit', component: AdminSubjectsView },
      { path: '/app/administracion/materias', name: 'admin-subjects', component: AdminSubjectsView },
    ],
  })
  return router.push(path).then(() => router.isReady()).then(() => router)
}

function renderWithRouter(router: Awaited<ReturnType<typeof setupRouter>>) {
  return render(defineComponent({ render: () => h(RouterView) }), { global: { plugins: [router] } })
}

function baseSubject(overrides: Record<string, unknown> = {}) {
  return {
    id: 21,
    nombre: 'Didáctica General',
    carreraId: 3,
    cargaHoraria: 64,
    tipoEspacio: 'MATERIA',
    curso: { id: 8, anio: 2, carreraId: 3 },
    activo: true,
    ...overrides,
  }
}

describe('AdminSubjectsView correlativity selector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listCareers.mockResolvedValue(careers)
    mocks.listSubjects.mockResolvedValue({ data: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } })
    mocks.getSubjectsByYear.mockResolvedValue(groupedSubjects)
    mocks.listUsers.mockResolvedValue({ data: [] })
    mocks.getTeachingAssignments.mockResolvedValue([])
    mocks.getPrerequisites.mockResolvedValue([])
    mocks.createSubject.mockResolvedValue(baseSubject())
    mocks.updateSubject.mockResolvedValue(baseSubject())
    vi.stubGlobal('confirm', vi.fn(() => true))
  })

  it('reveals grouped multi-select options only after enabling the checkbox', async () => {
    const user = userEvent.setup()
    const router = await setupRouter('/app/administracion/materias/nueva')
    renderWithRouter(router)

    const toggle = await screen.findByRole('checkbox', { name: 'Tiene correlatividades' })
    expect(toggle).not.toBeChecked()
    expect(screen.queryByText('1° año')).not.toBeInTheDocument()

    await screen.findByRole('option', { name: 'Profesorado de Inicial' })
    await user.selectOptions(screen.getByLabelText('Carrera'), '3')
    await user.click(toggle)

    expect(await screen.findByText('1° año')).toBeInTheDocument()
    expect(screen.getByText('2° año')).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Pedagogía' }))
    await user.click(screen.getByRole('checkbox', { name: 'Historia de la Educación' }))
    expect(screen.getByRole('checkbox', { name: 'Pedagogía' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Historia de la Educación' })).toBeChecked()
  })

  it('sends an explicit empty prerequisite list when creating without the checkbox', async () => {
    const user = userEvent.setup()
    const router = await setupRouter('/app/administracion/materias/nueva')
    renderWithRouter(router)

    await user.type(await screen.findByLabelText('Nombre'), 'Nueva materia')
    await user.selectOptions(screen.getByLabelText('Carrera'), '3')
    await user.click(screen.getByRole('button', { name: 'Guardar materia' }))

    await waitFor(() => expect(mocks.createSubject).toHaveBeenCalledWith(expect.objectContaining({ correlativasIds: [] })))
  })

  it('allows creating without prerequisites while career options are still pending', async () => {
    const user = userEvent.setup()
    const optionsDeferred = Promise.withResolvers<typeof groupedSubjects>()
    mocks.getSubjectsByYear.mockReturnValue(optionsDeferred.promise)
    const router = await setupRouter('/app/administracion/materias/nueva')
    renderWithRouter(router)

    await screen.findByRole('option', { name: 'Profesorado de Inicial' })
    await user.type(screen.getByLabelText('Nombre'), 'Nueva materia sin correlativas')
    await user.selectOptions(screen.getByLabelText('Carrera'), '3')

    const toggle = screen.getByRole('checkbox', { name: 'Tiene correlatividades' })
    expect(toggle).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Guardar materia' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Guardar materia' }))

    await waitFor(() => expect(mocks.createSubject).toHaveBeenCalledWith(expect.objectContaining({ correlativasIds: [] })))
    optionsDeferred.resolve(groupedSubjects)
  })

  it('blocks saving while prerequisite options are loading', async () => {
    const user = userEvent.setup()
    const optionsDeferred = Promise.withResolvers<typeof groupedSubjects>()
    mocks.getSubjectsByYear.mockReturnValue(optionsDeferred.promise)
    const router = await setupRouter('/app/administracion/materias/nueva')
    renderWithRouter(router)

    await screen.findByRole('option', { name: 'Profesorado de Inicial' })
    await user.type(screen.getByLabelText('Nombre'), 'Nueva materia')
    await user.selectOptions(screen.getByLabelText('Carrera'), '3')
    await user.click(screen.getByRole('checkbox', { name: 'Tiene correlatividades' }))
    await user.click(screen.getByRole('button', { name: 'Guardar materia' }))

    expect(mocks.createSubject).not.toHaveBeenCalled()
    optionsDeferred.resolve(groupedSubjects)
  })

  it('blocks saving when prerequisite options fail to load', async () => {
    const user = userEvent.setup()
    mocks.getSubjectsByYear.mockRejectedValue(new Error('network'))
    const router = await setupRouter('/app/administracion/materias/nueva')
    renderWithRouter(router)

    await screen.findByRole('option', { name: 'Profesorado de Inicial' })
    await user.type(screen.getByLabelText('Nombre'), 'Nueva materia')
    await user.selectOptions(screen.getByLabelText('Carrera'), '3')
    await user.click(screen.getByRole('checkbox', { name: 'Tiene correlatividades' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar las materias disponibles')
    await user.click(screen.getByRole('button', { name: 'Guardar materia' }))

    expect(mocks.createSubject).not.toHaveBeenCalled()
  })

  it('keeps editing disabled until careers load successfully', async () => {
    mocks.listCareers.mockRejectedValue(new Error('network'))
    mocks.getSubject.mockResolvedValue(baseSubject())
    mocks.getPrerequisites.mockResolvedValue([])
    const router = await setupRouter('/app/administracion/materias/21/editar')
    renderWithRouter(router)

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar las carreras.')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar materia' })).toBeDisabled())
  })

  it('retries career loading and enables editing only after the retry succeeds', async () => {
    const user = userEvent.setup()
    mocks.listCareers.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(careers)
    mocks.getSubject.mockResolvedValue(baseSubject())
    mocks.getPrerequisites.mockResolvedValue([])
    const router = await setupRouter('/app/administracion/materias/21/editar')
    renderWithRouter(router)

    await screen.findByText('No pudimos cargar las carreras.')
    await user.click(screen.getByRole('button', { name: 'Reintentar carreras' }))
    await screen.findByRole('option', { name: 'Profesorado de Inicial' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar materia' })).toBeEnabled())
  })

  it('keeps only the options from the current career when requests resolve out of order', async () => {
    const user = userEvent.setup()
    const oldCareerDeferred = Promise.withResolvers<typeof groupedSubjects>()
    const currentCareerDeferred = Promise.withResolvers<typeof groupedSubjects>()
    const currentCareerOptions = [{ anio: 1, cantidad: 1, materias: [{ id: 41, nombre: 'Materia de carrera actual', cargaHoraria: 64, tipoEspacio: 'MATERIA', activo: true, carreraId: 4 }] }]
    const oldCareerOptions = [{ anio: 1, cantidad: 1, materias: [{ id: 31, nombre: 'Materia de carrera anterior', cargaHoraria: 64, tipoEspacio: 'MATERIA', activo: true, carreraId: 3 }] }]
    mocks.getSubjectsByYear.mockImplementation((careerId: number) => careerId === 3 ? oldCareerDeferred.promise : currentCareerDeferred.promise)
    const router = await setupRouter('/app/administracion/materias/nueva')
    renderWithRouter(router)

    await screen.findByRole('option', { name: 'Profesorado de Inicial' })
    await user.selectOptions(screen.getByLabelText('Carrera'), '3')
    await user.selectOptions(screen.getByLabelText('Carrera'), '4')
    await user.click(screen.getByRole('checkbox', { name: 'Tiene correlatividades' }))
    currentCareerDeferred.resolve(currentCareerOptions)
    expect(await screen.findByRole('checkbox', { name: 'Materia de carrera actual' })).toBeInTheDocument()
    oldCareerDeferred.resolve(oldCareerOptions)

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByRole('checkbox', { name: 'Materia de carrera anterior' })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Materia de carrera actual' })).toBeInTheDocument()
  })

  it('clears selected ids immediately and announces a career change', async () => {
    const user = userEvent.setup()
    const router = await setupRouter('/app/administracion/materias/nueva')
    renderWithRouter(router)
    await screen.findByRole('option', { name: 'Profesorado de Inicial' })
    await user.selectOptions(await screen.findByLabelText('Carrera'), '3')
    await user.click(screen.getByRole('checkbox', { name: 'Tiene correlatividades' }))
    await user.click(await screen.findByRole('checkbox', { name: 'Pedagogía' }))

    await user.selectOptions(screen.getByLabelText('Carrera'), '4')

    expect(screen.getByRole('checkbox', { name: 'Tiene correlatividades' })).not.toBeChecked()
    expect(screen.getByRole('status')).toHaveTextContent('Se limpiaron las correlatividades porque cambiaste de carrera.')
    expect(mocks.getSubjectsByYear).toHaveBeenLastCalledWith(4)
  })

  it('preloads current prerequisites and keeps edit saving disabled until data is ready', async () => {
    const subjectDeferred = Promise.withResolvers<ReturnType<typeof baseSubject>>()
    const prerequisitesDeferred = Promise.withResolvers<Array<{ id: number; materiaRequeridaId: number; materiaRequerida: ReturnType<typeof baseSubject>; tipoRequisito: 'OBLIGATORIA' }>>()
    const optionsDeferred = Promise.withResolvers<typeof groupedSubjects>()
    mocks.getSubject.mockReturnValue(subjectDeferred.promise)
    mocks.getPrerequisites.mockReturnValue(prerequisitesDeferred.promise)
    mocks.getSubjectsByYear.mockReturnValue(optionsDeferred.promise)
    const router = await setupRouter('/app/administracion/materias/21/editar')
    renderWithRouter(router)

    expect(screen.getByRole('button', { name: 'Guardar materia' })).toBeDisabled()
    subjectDeferred.resolve(baseSubject())
    prerequisitesDeferred.resolve([{ id: 1, materiaRequeridaId: 11, materiaRequerida: baseSubject({ id: 11, nombre: 'Pedagogía' }), tipoRequisito: 'OBLIGATORIA' }])
    optionsDeferred.resolve(groupedSubjects)

    expect(await screen.findByRole('checkbox', { name: 'Pedagogía' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Tiene correlatividades' })).toBeChecked()
    expect(screen.queryByRole('checkbox', { name: 'Didáctica General' })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar materia' })).toBeEnabled())
  })

  it('warns when removing prerequisites and sends an explicit empty array', async () => {
    const user = userEvent.setup()
    mocks.getSubject.mockResolvedValue(baseSubject())
    mocks.getPrerequisites.mockResolvedValue([{ id: 1, materiaRequeridaId: 11, materiaRequerida: baseSubject({ id: 11, nombre: 'Pedagogía' }), tipoRequisito: 'OBLIGATORIA' }])
    const router = await setupRouter('/app/administracion/materias/21/editar')
    renderWithRouter(router)

    const toggle = await screen.findByRole('checkbox', { name: 'Tiene correlatividades' })
    await waitFor(() => expect(toggle).toBeChecked())
    await user.click(toggle)
    expect(screen.getByRole('alert')).toHaveTextContent('Al guardar, se eliminarán todas las correlatividades.')

    await user.click(screen.getByRole('button', { name: 'Guardar materia' }))

    await waitFor(() => expect(mocks.updateSubject).toHaveBeenCalledWith(21, expect.objectContaining({ correlativasIds: [] })))
  })

  it('normalizes nullable API fields before saving an edited subject with prerequisites', async () => {
    const user = userEvent.setup()
    mocks.getSubject.mockResolvedValue(baseSubject({
      descripcion: null,
      horasCatedra: null,
      modalidad: null,
      periodo: null,
      regimen: null,
    }))
    mocks.getPrerequisites.mockResolvedValue([])
    const router = await setupRouter('/app/administracion/materias/21/editar')
    renderWithRouter(router)

    const toggle = await screen.findByRole('checkbox', { name: 'Tiene correlatividades' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar materia' })).toBeEnabled())
    await user.click(toggle)
    await user.click(await screen.findByRole('checkbox', { name: 'Pedagogía' }))
    await user.click(screen.getByRole('button', { name: 'Guardar materia' }))

    await waitFor(() => expect(mocks.updateSubject).toHaveBeenCalledWith(21, expect.objectContaining({
      descripcion: '',
      horasCatedra: '',
      modalidad: 'PRESENCIAL',
      periodo: 'ANUAL',
      regimen: 'REGULAR_PRESENCIAL_SIN_PROMOCION',
      correlativasIds: [11],
    })))
  })
})
