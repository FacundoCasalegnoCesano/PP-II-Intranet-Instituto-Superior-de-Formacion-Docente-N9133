import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminSubjectsView from './AdminSubjectsView.vue'
import { ApiError } from '@/core/api/errors'
import { useFeedback } from '@/ui/feedback'

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
  listSpaces: vi.fn(),
}))

vi.mock('../api/adminApi', () => ({ adminApi: mocks }))
vi.mock('@/modules/spaces/api/spacesApi', () => ({ spacesApi: { list: mocks.listSpaces } }))
vi.mock('@/modules/spaces/components/SpacesAdminPanel.vue', () => ({ default: { template: '<div>Panel de espacios de prueba</div>' } }))

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

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => { resolve = complete })
  return { promise, resolve }
}

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
    mocks.listSpaces.mockResolvedValue([{ id: 51, nombre: 'Alfabetización', carreraId: 3, activo: true, materias: [], descripcion: null, composicionBloqueadaAt: null }])
    useFeedback().clear()
    vi.stubGlobal('confirm', vi.fn(() => true))
  })

  it('returns from the spaces tab to the subject list and removes only the tab query', async () => {
    const user = userEvent.setup()
    const router = await setupRouter('/app/administracion/materias?tab=spaces&search=Pedagog%C3%ADa&carreraId=3')
    renderWithRouter(router)

    expect(await screen.findByText('Panel de espacios de prueba')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Materias' }))

    await waitFor(() => expect(router.currentRoute.value.query.tab).toBeUndefined())
    expect(router.currentRoute.value.query).toEqual({ search: 'Pedagogía', carreraId: '3' })
    expect(await screen.findByText('No hay materias para mostrar.')).toBeInTheDocument()
    expect(screen.queryByText('Panel de espacios de prueba')).not.toBeInTheDocument()
  })

  it('adds Materia and Espacio curricular requirements through one name selector', async () => {
    const user = userEvent.setup()
    const router = await setupRouter('/app/administracion/materias/nueva')
    renderWithRouter(router)

    const toggle = await screen.findByRole('checkbox', { name: 'Tiene correlativas' })
    expect(toggle).not.toBeChecked()
    expect(screen.queryByLabelText('Correlativa')).not.toBeInTheDocument()

    await screen.findByRole('option', { name: 'Profesorado de Inicial' })
    await user.selectOptions(screen.getByLabelText('Carrera'), '3')
    await user.click(toggle)

    const selector = await screen.findByLabelText('Correlativa')
    expect(selector).toHaveDisplayValue('Seleccioná una correlativa')
    await user.selectOptions(selector, 'MATERIA:11')
    await user.click(screen.getByRole('button', { name: /^Agregar$/ }))
    expect(screen.getByText('Materia: Pedagogía')).toBeInTheDocument()
    await user.selectOptions(selector, 'ESPACIO:51')
    await user.click(screen.getByRole('button', { name: /^Agregar$/ }))
    expect(screen.getByText('Espacio curricular: Alfabetización')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Pedagogía' })).not.toBeInTheDocument()
  })

  it('creates a subject with typed requirements and never sends legacy prerequisite ids', async () => {
    const user = userEvent.setup()
    const router = await setupRouter('/app/administracion/materias/nueva')
    renderWithRouter(router)

    await user.type(await screen.findByLabelText('Nombre'), 'Materia con dos tipos de correlativa')
    await user.selectOptions(screen.getByLabelText('Carrera'), '3')
    await user.click(screen.getByRole('checkbox', { name: 'Tiene correlativas' }))
    const selector = await screen.findByLabelText('Correlativa')
    await user.selectOptions(selector, 'MATERIA:11')
    await user.click(screen.getByRole('button', { name: /^Agregar$/ }))
    await user.selectOptions(selector, 'ESPACIO:51')
    await user.click(screen.getByRole('button', { name: /^Agregar$/ }))
    await user.click(screen.getByRole('button', { name: 'Guardar materia' }))

    await waitFor(() => expect(mocks.createSubject).toHaveBeenCalled())
    const payload = mocks.createSubject.mock.calls[0]?.[0]
    expect(payload).toMatchObject({
      correlatividades: [
        { materiaRequeridaId: 11, aplicaCursado: false, aplicaRendir: true },
        { espacioRequeridoId: 51, aplicaCursado: false, aplicaRendir: true },
      ],
    })
    expect(payload).not.toHaveProperty('correlativasIds')
  })

  it('sends an explicit empty prerequisite list when creating without the checkbox', async () => {
    const user = userEvent.setup()
    const router = await setupRouter('/app/administracion/materias/nueva')
    renderWithRouter(router)

    await user.type(await screen.findByLabelText('Nombre'), 'Nueva materia')
    await user.selectOptions(screen.getByLabelText('Carrera'), '3')
    await user.click(screen.getByRole('button', { name: 'Guardar materia' }))

    await waitFor(() => expect(mocks.createSubject).toHaveBeenCalledWith(expect.objectContaining({ correlatividades: [] })))
  })

  it('allows creating without prerequisites while career options are still pending', async () => {
    const user = userEvent.setup()
    const optionsDeferred = deferred<typeof groupedSubjects>()
    mocks.getSubjectsByYear.mockReturnValue(optionsDeferred.promise)
    const router = await setupRouter('/app/administracion/materias/nueva')
    renderWithRouter(router)

    await screen.findByRole('option', { name: 'Profesorado de Inicial' })
    await user.type(screen.getByLabelText('Nombre'), 'Nueva materia sin correlativas')
    await user.selectOptions(screen.getByLabelText('Carrera'), '3')

    const toggle = screen.getByRole('checkbox', { name: 'Tiene correlativas' })
    expect(toggle).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Guardar materia' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Guardar materia' }))

    await waitFor(() => expect(mocks.createSubject).toHaveBeenCalledWith(expect.objectContaining({ correlatividades: [] })))
    optionsDeferred.resolve(groupedSubjects)
  })

  it('blocks saving while prerequisite options are loading', async () => {
    const user = userEvent.setup()
    const optionsDeferred = deferred<typeof groupedSubjects>()
    mocks.getSubjectsByYear.mockReturnValue(optionsDeferred.promise)
    const router = await setupRouter('/app/administracion/materias/nueva')
    renderWithRouter(router)

    await screen.findByRole('option', { name: 'Profesorado de Inicial' })
    await user.type(screen.getByLabelText('Nombre'), 'Nueva materia')
    await user.selectOptions(screen.getByLabelText('Carrera'), '3')
    await user.click(screen.getByRole('checkbox', { name: 'Tiene correlativas' }))
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
    await user.click(screen.getByRole('checkbox', { name: 'Tiene correlativas' }))
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
    const oldCareerDeferred = deferred<typeof groupedSubjects>()
    const currentCareerDeferred = deferred<typeof groupedSubjects>()
    const currentCareerOptions = [{ anio: 1, cantidad: 1, materias: [{ id: 41, nombre: 'Materia de carrera actual', cargaHoraria: 64, tipoEspacio: 'MATERIA', activo: true, carreraId: 4 }] }]
    const oldCareerOptions = [{ anio: 1, cantidad: 1, materias: [{ id: 31, nombre: 'Materia de carrera anterior', cargaHoraria: 64, tipoEspacio: 'MATERIA', activo: true, carreraId: 3 }] }]
    mocks.getSubjectsByYear.mockImplementation((careerId: number) => careerId === 3 ? oldCareerDeferred.promise : currentCareerDeferred.promise)
    const router = await setupRouter('/app/administracion/materias/nueva')
    renderWithRouter(router)

    await screen.findByRole('option', { name: 'Profesorado de Inicial' })
    await user.selectOptions(screen.getByLabelText('Carrera'), '3')
    await user.selectOptions(screen.getByLabelText('Carrera'), '4')
    await user.click(screen.getByRole('checkbox', { name: 'Tiene correlativas' }))
    currentCareerDeferred.resolve(currentCareerOptions)
    expect(await screen.findByRole('option', { name: 'Materia de carrera actual' })).toBeInTheDocument()
    oldCareerDeferred.resolve(oldCareerOptions)

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByRole('option', { name: 'Materia de carrera anterior' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Materia de carrera actual' })).toBeInTheDocument()
  })

  it('clears selected ids immediately and announces a career change', async () => {
    const user = userEvent.setup()
    const router = await setupRouter('/app/administracion/materias/nueva')
    renderWithRouter(router)
    await screen.findByRole('option', { name: 'Profesorado de Inicial' })
    await user.selectOptions(await screen.findByLabelText('Carrera'), '3')
    await user.click(screen.getByRole('checkbox', { name: 'Tiene correlativas' }))
    await user.selectOptions(await screen.findByLabelText('Correlativa'), 'MATERIA:11')
    await user.click(screen.getByRole('button', { name: /^Agregar$/ }))

    await user.selectOptions(screen.getByLabelText('Carrera'), '4')

    expect(screen.getByRole('checkbox', { name: 'Tiene correlativas' })).not.toBeChecked()
    expect(screen.getByRole('status')).toHaveTextContent('Se limpiaron las correlatividades porque cambiaste de carrera.')
    expect(screen.queryByText('Materia: Pedagogía')).not.toBeInTheDocument()
    expect(mocks.getSubjectsByYear).toHaveBeenLastCalledWith(4)
  })

  it('preloads current prerequisites and keeps edit saving disabled until data is ready', async () => {
    const subjectDeferred = deferred<ReturnType<typeof baseSubject>>()
    const prerequisitesDeferred = deferred<Array<{ id: number; materiaRequeridaId: number; materiaRequerida: ReturnType<typeof baseSubject>; tipoRequisito: 'OBLIGATORIA' }>>()
    const optionsDeferred = deferred<typeof groupedSubjects>()
    mocks.getSubject.mockReturnValue(subjectDeferred.promise)
    mocks.getPrerequisites.mockReturnValue(prerequisitesDeferred.promise)
    mocks.getSubjectsByYear.mockReturnValue(optionsDeferred.promise)
    const router = await setupRouter('/app/administracion/materias/21/editar')
    renderWithRouter(router)

    expect(screen.getByRole('button', { name: 'Guardar materia' })).toBeDisabled()
    subjectDeferred.resolve(baseSubject())
    prerequisitesDeferred.resolve([{ id: 1, materiaRequeridaId: 11, materiaRequerida: baseSubject({ id: 11, nombre: 'Pedagogía' }), tipoRequisito: 'OBLIGATORIA' }])
    optionsDeferred.resolve(groupedSubjects)

    expect(await screen.findByText('Materia: Pedagogía')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Tiene correlativas' })).toBeChecked()
    expect(screen.queryByRole('checkbox', { name: 'Didáctica General' })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar materia' })).toBeEnabled())
  })

  it('warns when removing prerequisites and sends an explicit empty array', async () => {
    const user = userEvent.setup()
    mocks.getSubject.mockResolvedValue(baseSubject())
    mocks.getPrerequisites.mockResolvedValue([{ id: 1, materiaRequeridaId: 11, materiaRequerida: baseSubject({ id: 11, nombre: 'Pedagogía' }), tipoRequisito: 'OBLIGATORIA' }])
    const router = await setupRouter('/app/administracion/materias/21/editar')
    renderWithRouter(router)

    const toggle = await screen.findByRole('checkbox', { name: 'Tiene correlativas' })
    await waitFor(() => expect(toggle).toBeChecked())
    await user.click(toggle)
    expect(screen.getByRole('alert')).toHaveTextContent('Al guardar, se eliminarán todas las correlatividades.')

    await user.click(screen.getByRole('button', { name: 'Guardar materia' }))

    await waitFor(() => expect(mocks.updateSubject).toHaveBeenCalledWith(21, expect.objectContaining({ correlatividades: [] })))
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

    const toggle = await screen.findByRole('checkbox', { name: 'Tiene correlativas' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar materia' })).toBeEnabled())
    await user.click(toggle)
    await user.selectOptions(await screen.findByLabelText('Correlativa'), 'MATERIA:11')
    await user.click(screen.getByRole('button', { name: /^Agregar$/ }))
    await user.click(screen.getByRole('button', { name: 'Guardar materia' }))

    await waitFor(() => expect(mocks.updateSubject).toHaveBeenCalledWith(21, expect.objectContaining({
      descripcion: '',
      horasCatedra: '',
      modalidad: 'PRESENCIAL',
      periodo: 'ANUAL',
      regimen: 'REGULAR_PRESENCIAL_SIN_PROMOCION',
      correlatividades: [{ materiaRequeridaId: 11, aplicaCursado: false, aplicaRendir: true }],
    })))
    expect(mocks.updateSubject.mock.calls[0]?.[1]).not.toHaveProperty('correlativasIds')
  })

  it('does not replace prerequisite rules when saving a component subject', async () => {
    const user = userEvent.setup()
    mocks.getSubject.mockResolvedValue(baseSubject({ espacioCurricularId: 51 }))
    mocks.getPrerequisites.mockResolvedValue([{ id: 1, materiaRequeridaId: 11, materiaRequerida: baseSubject({ id: 11, nombre: 'Pedagogía' }), tipoRequisito: 'OBLIGATORIA' }])
    const router = await setupRouter('/app/administracion/materias/21/editar')
    renderWithRouter(router)

    expect(await screen.findByText('Esta materia hereda las correlativas del espacio curricular al que pertenece.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Nombre'), ' actualizada')
    await user.click(screen.getByRole('button', { name: 'Guardar materia' }))

    await waitFor(() => expect(mocks.updateSubject).toHaveBeenCalled())
    const payload = mocks.updateSubject.mock.calls[0]?.[1]
    expect(payload).not.toHaveProperty('correlativasIds')
    expect(payload).not.toHaveProperty('correlatividades')
  })

  it('shows the API validation reason when a subject cannot be saved', async () => {
    const user = userEvent.setup()
    mocks.createSubject.mockRejectedValueOnce(new ApiError('La materia pertenece a un espacio curricular activo.', 400))
    const router = await setupRouter('/app/administracion/materias/nueva')
    renderWithRouter(router)

    await user.type(await screen.findByLabelText('Nombre'), 'Materia componente')
    await user.selectOptions(screen.getByLabelText('Carrera'), '3')
    await user.click(screen.getByRole('button', { name: 'Guardar materia' }))

    await waitFor(() => expect(useFeedback().messages.value.at(-1)?.text).toBe('La materia pertenece a un espacio curricular activo.'))
    expect(router.currentRoute.value.name).toBe('admin-subject-create')
  })
})
