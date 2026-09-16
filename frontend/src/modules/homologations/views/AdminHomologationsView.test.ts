import { fireEvent, render, screen, waitFor, within } from '@testing-library/vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminHomologationsView from './AdminHomologationsView.vue'
import { homologationsApi } from '../api/homologationsApi'
import type { Homologation } from '../types/homologations'
import { ApiError } from '@/core/api/errors'
import { adminApi } from '@/modules/admin/api/adminApi'

vi.mock('../api/homologationsApi', () => ({
  homologationsApi: {
    list: vi.fn(),
    create: vi.fn(),
    getById: vi.fn(),
    saveComplementaryGrade: vi.fn(),
    resolve: vi.fn(),
    listStudentCareers: vi.fn(),
    listCareerSubjects: vi.fn(),
    listFilterCareers: vi.fn(),
    listFilterSubjects: vi.fn(),
  },
}))

vi.mock('@/modules/admin/api/adminApi', () => ({
  adminApi: {
    listActiveStudents: vi.fn(),
  },
}))

const pagination = (page = 1, total = 1, totalPages = 1) => ({ page, limit: 20, total, totalPages })

const item = (overrides: Partial<Homologation> = {}): Homologation => ({
  id: 7,
  alumno: { idUsuario: 13, apellidoNombre: 'Lucía Test', dni: '42666888', email: 'lucia@test.edu' },
  materia: { id: 14, nombre: 'Álgebra y Geometría', notaMinima: 6, carrera: { id: 3, nombre: 'Profesorado de Inicial' } },
  tipo: 'PARCIAL',
  estado: 'PENDIENTE',
  calificacion: null,
  notaComplementaria: null,
  observacion: 'Trayecto reconocido',
  fecha: '2026-09-10T12:00:00.000Z',
  createdAt: '2026-09-10T12:00:00.000Z',
  updatedAt: '2026-09-10T12:00:00.000Z',
  ...overrides,
})

const student = (idUsuario = 13, apellidoNombre = 'Lucía Test') => ({
  idUsuario,
  apellidoNombre,
  dni: idUsuario === 13 ? '42666888' : '45555444',
  email: `${idUsuario}@test.edu`,
  activo: true,
  rol: 'ALUMNO',
})

const career = (id = 3, nombre = 'Profesorado de Inicial') => ({
  id,
  carreraId: id,
  activo: true,
  carrera: { id, nombre, activo: true, materias: [] },
})

const subject = (id = 14, nombre = 'Álgebra y Geometría') => ({ id, nombre, activo: true, carreraId: 3 })
const filterCareer = (id = 3, nombre = 'Profesorado de Inicial', activo = true) => ({ id, nombre, activo })

type ListResult = { data: Homologation[]; pagination: ReturnType<typeof pagination> }

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

async function renderView(path = '/app/administracion/homologaciones') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app/administracion/homologaciones', name: 'admin-homologations', component: AdminHomologationsView },
      { path: '/app/administracion/homologaciones/nueva', name: 'admin-homologation-create', component: AdminHomologationsView },
      { path: '/app/administracion/homologaciones/:id', name: 'admin-homologation-detail', component: AdminHomologationsView },
    ],
  })
  await router.push(path)
  await router.isReady()
  render(AdminHomologationsView, { global: { plugins: [router] } })
  return router
}

describe('AdminHomologationsView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(homologationsApi.list).mockResolvedValue({ data: [item()], pagination: pagination() })
    vi.mocked(homologationsApi.create).mockResolvedValue({ data: item({ id: 21 }), message: 'Solicitud creada' })
    vi.mocked(homologationsApi.getById).mockResolvedValue(item())
    vi.mocked(homologationsApi.saveComplementaryGrade).mockResolvedValue({ data: item({ notaComplementaria: 6 }), message: 'Nota guardada' })
    vi.mocked(homologationsApi.resolve).mockResolvedValue({ data: item({ estado: 'APROBADA', calificacion: 6, notaComplementaria: 6 }), message: 'Solicitud aprobada' })
    vi.mocked(homologationsApi.listStudentCareers).mockResolvedValue([career()])
    vi.mocked(homologationsApi.listCareerSubjects).mockResolvedValue([subject()])
    vi.mocked(homologationsApi.listFilterCareers).mockResolvedValue([filterCareer()])
    vi.mocked(homologationsApi.listFilterSubjects).mockResolvedValue([subject()])
    vi.mocked(adminApi.listActiveStudents).mockResolvedValue({ data: [student(), student(14, 'Otro alumno')], pagination: pagination() })
  })

  it('loads the first page with the fixed server page size', async () => {
    await renderView()

    expect((await screen.findAllByText('Lucía Test')).length).toBe(2)
    expect(homologationsApi.list).toHaveBeenCalledWith({ page: 1, limit: 20 })
  })

  it('sends every filter to the backend and returns to page one when filters are applied', async () => {
    const router = await renderView('/app/administracion/homologaciones?page=3')
    await screen.findAllByText('Lucía Test')

    await fireEvent.update(screen.getByLabelText('Buscar'), ' Lucía ')
    await fireEvent.update(screen.getByLabelText('Estado'), 'PENDIENTE')
    await fireEvent.update(screen.getByLabelText('Tipo'), 'PARCIAL')
    await fireEvent.update(screen.getByLabelText('Carrera'), '3')
    await fireEvent.update(screen.getByLabelText('Materia'), '14')
    await fireEvent.submit(screen.getByRole('form'))

    await waitFor(() => expect(homologationsApi.list).toHaveBeenLastCalledWith({
      search: 'Lucía', estado: 'PENDIENTE', tipo: 'PARCIAL', carreraId: 3, materiaId: 14, page: 1, limit: 20,
    }))
    expect(router.currentRoute.value.query).toEqual({ search: 'Lucía', estado: 'PENDIENTE', tipo: 'PARCIAL', carreraId: '3', materiaId: '14' })
  })

  it('reloads from external URL changes and discards the older response', async () => {
    const oldResponse = deferred<ListResult>()
    const newer = item({ id: 8, alumno: { ...item().alumno, apellidoNombre: 'Nueva nómina' } })
    vi.mocked(homologationsApi.list).mockReturnValueOnce(oldResponse.promise).mockResolvedValueOnce({ data: [newer], pagination: pagination(2, 21, 2) })
    const router = await renderView('/app/administracion/homologaciones?page=1')

    await router.push('/app/administracion/homologaciones?search=nueva&page=2')
    expect((await screen.findAllByText('Nueva nómina')).length).toBe(2)
    oldResponse.resolve({ data: [item({ alumno: { ...item().alumno, apellidoNombre: 'Respuesta vieja' } })], pagination: pagination() })
    await Promise.resolve()

    expect(screen.queryByText('Respuesta vieja')).not.toBeInTheDocument()
    expect(homologationsApi.list).toHaveBeenLastCalledWith({ search: 'nueva', page: 2, limit: 20 })
  })

  it('preserves the current filters in a safe internal return URL for the future detail view', async () => {
    await renderView('/app/administracion/homologaciones?search=Luc%C3%ADa&estado=PENDIENTE&tipo=PARCIAL&carreraId=3&materiaId=14&page=2')
    const links = await screen.findAllByRole('link', { name: /Ver detalle/ })
    const target = new URL(links[0].getAttribute('href') ?? '', window.location.origin)

    expect(target.pathname).toBe('/app/administracion/homologaciones/7')
    expect(target.searchParams.get('returnTo')).toBe('/app/administracion/homologaciones?search=Luc%C3%ADa&estado=PENDIENTE&tipo=PARCIAL&carreraId=3&materiaId=14&page=2')
    expect(target.searchParams.get('returnTo')).toMatch(/^\/app\/administracion\/homologaciones\?/) 
  })

  it('keeps unapplied control edits out of the detail return URL', async () => {
    await renderView('/app/administracion/homologaciones?search=aplicada&estado=PENDIENTE&page=2')
    await screen.findAllByText('Lucía Test')

    await fireEvent.update(screen.getByLabelText('Buscar'), 'todavía sin aplicar')
    const link = (await screen.findAllByRole('link', { name: /Ver detalle/ }))[0]
    const target = new URL(link.getAttribute('href') ?? '', window.location.origin)

    expect(target.searchParams.get('returnTo')).toBe('/app/administracion/homologaciones?search=aplicada&estado=PENDIENTE&page=2')
    expect(target.searchParams.get('returnTo')).not.toContain('todav%C3%ADa')
  })

  it('presenta los mismos datos del registro en tabla y tarjetas', async () => {
    await renderView()

    await screen.findAllByText('Lucía Test')
    const fila = within(screen.getByRole('table')).getByRole('row', { name: /Lucía Test/ })
    const tarjeta = screen.getByRole('article')
    for (const representacion of [fila, tarjeta]) {
      expect(representacion).toHaveTextContent('Lucía Test')
      expect(representacion).toHaveTextContent('DNI 42666888')
      expect(representacion).toHaveTextContent('Profesorado de Inicial')
      expect(representacion).toHaveTextContent('Álgebra y Geometría')
      expect(within(representacion).getByText('Parcial')).toBeVisible()
      expect(within(representacion).getByRole('status', { name: 'Estado oficial: Pendiente. Pendiente de examen complementario' })).toBeVisible()
      expect(within(representacion).getByText('—')).toBeVisible()
      expect(within(representacion).getByText('10/9/2026')).toBeVisible()
      expect(within(representacion).getByRole('link', { name: 'Ver detalle de Lucía Test' })).toHaveAttribute('href', '/app/administracion/homologaciones/7?returnTo=%2Fapp%2Fadministracion%2Fhomologaciones')
    }
    expect(screen.getAllByRole('link', { name: /Ver detalle/ })).toHaveLength(2)
  })

  it('expone estado oficial y explicación del badge con nombre accesible, icono y color', async () => {
    await renderView()

    const badges = await screen.findAllByRole('status', { name: 'Estado oficial: Pendiente. Pendiente de examen complementario' })
    expect(badges).toHaveLength(2)
    for (const badge of badges) {
      expect(badge).toHaveTextContent(/^Pendiente\s*· Pendiente de examen complementario$/)
      expect(badge).toHaveClass('bg-amber-100', 'text-amber-900')
      const icono = badge.querySelector('[data-status-icon]')
      expect(icono).toHaveAttribute('aria-hidden', 'true')
      expect(icono).toHaveAttribute('focusable', 'false')
    }
  })

  it('shows loading, empty and error states with retry', async () => {
    const pending = deferred<ListResult>()
    vi.mocked(homologationsApi.list).mockReturnValueOnce(pending.promise)
    await renderView()
    expect(await screen.findByText('Cargando…')).toBeVisible()
    pending.resolve({ data: [], pagination: pagination(1, 0, 0) })
    expect(await screen.findByText('No hay homologaciones con esos filtros.')).toBeVisible()

    vi.mocked(homologationsApi.list).mockRejectedValueOnce(new ApiError('No pudimos cargar las homologaciones.', 500, 'HTTP_ERROR'))
    const retryRouter = await renderView()
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar las homologaciones.')
    vi.mocked(homologationsApi.list).mockResolvedValueOnce({ data: [item({ id: 9 })], pagination: pagination() })
    await fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect((await screen.findAllByText('Álgebra y Geometría')).length).toBe(1)
    expect(retryRouter.currentRoute.value.name).toBe('admin-homologations')
  })

  it('carga catálogos históricos completos y mantiene la materia dependiente de la carrera', async () => {
    vi.mocked(homologationsApi.listFilterCareers).mockResolvedValue([
      filterCareer(), filterCareer(4, 'Profesorado de Primaria', false),
    ])
    vi.mocked(homologationsApi.listFilterSubjects).mockResolvedValue([
      subject(), { id: 15, nombre: 'Historia', activo: false, carreraId: 3 },
    ])
    await renderView()

    expect(await screen.findByRole('option', { name: 'Profesorado de Primaria (histórica)' })).toBeVisible()
    await fireEvent.update(screen.getByLabelText('Carrera'), '3')
    expect(await screen.findByRole('option', { name: 'Historia (histórica)' })).toBeVisible()
    expect(screen.getByLabelText('Materia')).toHaveValue('')
    expect(homologationsApi.listFilterSubjects).toHaveBeenLastCalledWith(3)

    await fireEvent.update(screen.getByLabelText('Materia'), '15')
    await fireEvent.update(screen.getByLabelText('Carrera'), '4')
    expect(screen.getByLabelText('Materia')).toHaveValue('')
    expect(homologationsApi.listFilterSubjects).toHaveBeenLastCalledWith(4)
  })

  it('invalida el catálogo diferido al salir al alta y cancelar hacia otra carrera', async () => {
    const cargaEnAlta = deferred<ReturnType<typeof subject>[]>()
    const cargaAlVolver = deferred<ReturnType<typeof subject>[]>()
    const materiaB = { id: 42, nombre: 'Didáctica de Primaria', activo: true, carreraId: 4 }
    vi.mocked(homologationsApi.listFilterCareers).mockResolvedValue([filterCareer(), filterCareer(4, 'Profesorado de Primaria')])
    vi.mocked(homologationsApi.listFilterSubjects)
      .mockResolvedValueOnce([subject()])
      .mockReturnValueOnce(cargaEnAlta.promise)
      .mockReturnValueOnce(cargaAlVolver.promise)
    const router = await renderView('/app/administracion/homologaciones?carreraId=3')
    await screen.findByRole('option', { name: 'Álgebra y Geometría' })

    await fireEvent.update(screen.getByLabelText('Carrera'), '4')
    expect(screen.getByLabelText('Materia')).toBeDisabled()
    expect(screen.queryByRole('option', { name: 'Álgebra y Geometría' })).not.toBeInTheDocument()
    await fireEvent.submit(screen.getByRole('form', { name: 'Filtros de homologaciones' }))
    await waitFor(() => expect(router.currentRoute.value.query).toEqual({ carreraId: '4' }))
    await fireEvent.click(screen.getByRole('link', { name: 'Nueva homologación' }))
    await waitFor(() => expect(router.currentRoute.value.name).toBe('admin-homologation-create'))
    cargaEnAlta.resolve([materiaB])
    await Promise.resolve()
    await fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    await waitFor(() => expect(router.currentRoute.value.query).toEqual({ carreraId: '4' }))
    expect(screen.getByLabelText('Materia')).toBeDisabled()
    expect(screen.queryByRole('option', { name: 'Álgebra y Geometría' })).not.toBeInTheDocument()
    expect(homologationsApi.listFilterSubjects).toHaveBeenCalledTimes(3)
    cargaAlVolver.resolve([materiaB])
    expect(await screen.findByRole('option', { name: 'Didáctica de Primaria' })).toHaveValue('42')
    expect(screen.getByLabelText('Materia')).toBeEnabled()
    await fireEvent.update(screen.getByLabelText('Materia'), '42')
    await fireEvent.submit(screen.getByRole('form', { name: 'Filtros de homologaciones' }))
    await waitFor(() => expect(homologationsApi.list).toHaveBeenLastCalledWith({ carreraId: 4, materiaId: 42, page: 1, limit: 20 }))
  })

  it('returns to the last valid page when a later page becomes empty', async () => {
    vi.mocked(homologationsApi.list)
      .mockResolvedValueOnce({ data: [], pagination: pagination(2, 20, 1) })
      .mockResolvedValueOnce({ data: [item()], pagination: pagination(1, 20, 1) })
    const router = await renderView('/app/administracion/homologaciones?page=2')

    expect((await screen.findAllByText('Lucía Test')).length).toBe(2)
    await waitFor(() => expect(homologationsApi.list).toHaveBeenLastCalledWith({ page: 1, limit: 20 }))
    expect(router.currentRoute.value.query).toEqual({})
  })

  it('creates in the named mode and searches active students server-side with debounce', async () => {
    vi.useFakeTimers()
    try {
    const router = await renderView('/app/administracion/homologaciones/nueva')
    expect(router.currentRoute.value.name).toBe('admin-homologation-create')
    expect(homologationsApi.listFilterCareers).not.toHaveBeenCalled()
    expect(homologationsApi.listFilterSubjects).not.toHaveBeenCalled()
    expect(await screen.findByRole('option', { name: /Lucía Test/ })).toBeVisible()
    vi.mocked(adminApi.listActiveStudents).mockClear()

    await fireEvent.update(screen.getByLabelText('Buscar alumno'), '  Nueva  ')
    await vi.advanceTimersByTimeAsync(299)
    expect(adminApi.listActiveStudents).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await Promise.resolve()
    expect(adminApi.listActiveStudents).toHaveBeenCalledTimes(1)
    expect(adminApi.listActiveStudents).toHaveBeenLastCalledWith('Nueva', { limit: 50 })
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancela loading y catálogos cuando el padre vuelve al placeholder mientras espera una respuesta', async () => {
    const pendingCareers = deferred<ReturnType<typeof career>[]>()
    vi.mocked(homologationsApi.listStudentCareers).mockReturnValueOnce(pendingCareers.promise)
    await renderView('/app/administracion/homologaciones/nueva')
    await screen.findByRole('option', { name: /Lucía Test/ })

    const careerSelect = screen.getByLabelText('Carrera activa')
    await fireEvent.update(screen.getByLabelText('Alumno activo'), '13')
    expect(careerSelect).toHaveAttribute('aria-busy', 'true')
    await fireEvent.update(screen.getByLabelText('Alumno activo'), '')
    expect(careerSelect).toHaveValue('')
    expect(careerSelect).toHaveAttribute('aria-busy', 'false')
    expect(screen.queryByText('Profesorado de Inicial')).not.toBeInTheDocument()

    pendingCareers.resolve([career()])
    await Promise.resolve()
    expect(careerSelect).toHaveAttribute('aria-busy', 'false')

    await fireEvent.update(screen.getByLabelText('Alumno activo'), '13')
    expect(await screen.findByText('Profesorado de Inicial')).toBeVisible()
    const pendingSubjects = deferred<ReturnType<typeof subject>[]>()
    vi.mocked(homologationsApi.listCareerSubjects).mockReturnValueOnce(pendingSubjects.promise)
    const subjectSelect = screen.getByLabelText('Materia activa')
    await fireEvent.update(careerSelect, '3')
    expect(subjectSelect).toHaveAttribute('aria-busy', 'true')
    await fireEvent.update(careerSelect, '')
    expect(subjectSelect).toHaveValue('')
    expect(subjectSelect).toHaveAttribute('aria-busy', 'false')
    expect(screen.queryByText('Álgebra y Geometría')).not.toBeInTheDocument()

    pendingSubjects.resolve([subject()])
    await Promise.resolve()
    expect(subjectSelect).toHaveAttribute('aria-busy', 'false')
  })

  it('loads active careers and subjects from dependent selections and clears them before reload', async () => {
    const router = await renderView('/app/administracion/homologaciones/nueva')
    await screen.findByRole('option', { name: /Lucía Test/ })

    await fireEvent.update(screen.getByLabelText('Alumno activo'), '13')
    expect(await screen.findByText('Profesorado de Inicial')).toBeVisible()
    await fireEvent.update(screen.getByLabelText('Carrera activa'), '3')
    expect(await screen.findByText('Álgebra y Geometría')).toBeVisible()

    await fireEvent.update(screen.getByLabelText('Alumno activo'), '14')
    expect(screen.getByLabelText('Carrera activa')).toHaveValue('')
    expect(screen.getByLabelText('Materia activa')).toHaveValue('')
    expect(homologationsApi.listStudentCareers).toHaveBeenLastCalledWith(14)
    expect(router.currentRoute.value.name).toBe('admin-homologation-create')
  })

  it('descarta catálogos de carreras obsoletos cuando cambia el alumno', async () => {
    const first = deferred<ReturnType<typeof career>[]>()
    const second = deferred<ReturnType<typeof career>[]>()
    vi.mocked(homologationsApi.listStudentCareers).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const router = await renderView('/app/administracion/homologaciones/nueva')
    await screen.findByRole('option', { name: /Lucía Test/ })

    await fireEvent.update(screen.getByLabelText('Alumno activo'), '13')
    await fireEvent.update(screen.getByLabelText('Alumno activo'), '14')
    second.resolve([career(4, 'Profesorado de Primaria')])
    expect(await screen.findByText('Profesorado de Primaria')).toBeVisible()
    first.resolve([career(3, 'Carrera obsoleta')])
    await Promise.resolve()

    expect(screen.queryByText('Carrera obsoleta')).not.toBeInTheDocument()
    expect(router.currentRoute.value.name).toBe('admin-homologation-create')
  })

  it('exige la nota anterior entera para una homologación total y conserva valores ante error', async () => {
    vi.mocked(homologationsApi.create).mockRejectedValueOnce(new ApiError('No se pudo crear la homologación.', 422, 'VALIDATION_ERROR'))
    await renderView('/app/administracion/homologaciones/nueva?returnTo=%2Fapp%2Fadministracion%2Fhomologaciones%3Fpage%3D2')
    await screen.findByRole('option', { name: /Lucía Test/ })
    await fireEvent.update(screen.getByLabelText('Alumno activo'), '13')
    await fireEvent.update(screen.getByLabelText('Carrera activa'), '3')
    await fireEvent.update(screen.getByLabelText('Materia activa'), '14')

    expect(screen.getByLabelText('Nota de la institución anterior')).toBeVisible()
    await fireEvent.click(screen.getByRole('button', { name: 'Crear homologación' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('La nota de la institución anterior es requerida')
    await fireEvent.update(screen.getByLabelText('Nota de la institución anterior'), '8')
    await fireEvent.update(screen.getByLabelText('Observación'), 'Conservar este texto')
    await fireEvent.click(screen.getByRole('button', { name: 'Crear homologación' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo crear la homologación.')
    expect(document.activeElement).toBe(document.getElementById('homologation-form-status'))
    expect(screen.getByLabelText('Alumno activo')).toHaveValue('13')
    expect(screen.getByLabelText('Carrera activa')).toHaveValue('3')
    expect(screen.getByLabelText('Materia activa')).toHaveValue('14')
    expect(screen.getByLabelText('Nota de la institución anterior')).toHaveValue(8)
    expect(screen.getByLabelText('Observación')).toHaveValue('Conservar este texto')
  })

  it('asocia el error de validación al primer control inválido y le devuelve el foco', async () => {
    await renderView('/app/administracion/homologaciones/nueva')
    await screen.findByRole('option', { name: /Lucía Test/ })

    await fireEvent.click(screen.getByRole('button', { name: 'Crear homologación' }))

    const studentSelect = screen.getByLabelText('Alumno activo')
    expect(studentSelect).toHaveAttribute('aria-invalid', 'true')
    expect(studentSelect).toHaveAttribute('aria-describedby', expect.stringContaining('homologation-alumnoId-error'))
    expect(await screen.findByText('Seleccioná un alumno.')).toBeVisible()
    expect(document.activeElement).toBe(studentSelect)
  })

  it('oculta y prohíbe nota definitiva en parcial, envía payload exacto y preserva returnTo interno', async () => {
    const router = await renderView('/app/administracion/homologaciones/nueva?returnTo=%2Fapp%2Fadministracion%2Fhomologaciones%3Fpage%3D2')
    await screen.findByRole('option', { name: /Lucía Test/ })
    await fireEvent.update(screen.getByLabelText('Alumno activo'), '13')
    await fireEvent.update(screen.getByLabelText('Carrera activa'), '3')
    await fireEvent.update(screen.getByLabelText('Materia activa'), '14')
    await fireEvent.click(screen.getByLabelText('Parcial'))

    expect(screen.queryByLabelText('Nota de la institución anterior')).not.toBeInTheDocument()
    expect(screen.getByText('La nota definitiva se cargará después del examen complementario.')).toBeVisible()
    await fireEvent.update(screen.getByLabelText('Observación'), 'Parcial histórica')
    await fireEvent.click(screen.getByRole('button', { name: 'Crear homologación' }))

    await waitFor(() => expect(homologationsApi.create).toHaveBeenCalledWith({
      alumnoId: 13,
      materiaId: 14,
      tipoHomologacion: 'PARCIAL',
      calificacion: null,
      observacion: 'Parcial histórica',
    }))
    await waitFor(() => expect(router.currentRoute.value.name).toBe('admin-homologation-detail'))
    expect(router.currentRoute.value.query).toEqual({ returnTo: '/app/administracion/homologaciones?page=2' })
  })

  it('conserva el returnTo comprometido al ir del listado filtrado al alta y al detalle', async () => {
    const router = await renderView('/app/administracion/homologaciones?search=aplicada&estado=PENDIENTE&tipo=PARCIAL&carreraId=3&materiaId=14&page=2')
    await screen.findAllByText('Lucía Test')

    await fireEvent.click(screen.getByRole('link', { name: 'Nueva homologación' }))
    await waitFor(() => expect(router.currentRoute.value.name).toBe('admin-homologation-create'))
    expect(router.currentRoute.value.query).toEqual({
      returnTo: '/app/administracion/homologaciones?search=aplicada&estado=PENDIENTE&tipo=PARCIAL&carreraId=3&materiaId=14&page=2',
    })

    await screen.findByRole('option', { name: /Lucía Test/ })
    await fireEvent.update(screen.getByLabelText('Alumno activo'), '13')
    await fireEvent.update(screen.getByLabelText('Carrera activa'), '3')
    await fireEvent.update(screen.getByLabelText('Materia activa'), '14')
    await fireEvent.click(screen.getByLabelText('Parcial'))
    await fireEvent.click(screen.getByRole('button', { name: 'Crear homologación' }))

    await waitFor(() => expect(router.currentRoute.value.name).toBe('admin-homologation-detail'))
    expect(router.currentRoute.value.query).toEqual({
      returnTo: '/app/administracion/homologaciones?search=aplicada&estado=PENDIENTE&tipo=PARCIAL&carreraId=3&materiaId=14&page=2',
    })
  })

  it('cancela el alta conservando sólo el returnTo interno normalizado', async () => {
    const returnTo = encodeURIComponent('/app/administracion/homologaciones?search=%20Luc%C3%ADa%20&estado=PENDIENTE&tipo=PARCIAL&carreraId=3&materiaId=14&page=2&sort=createdAt')
    const router = await renderView(`/app/administracion/homologaciones/nueva?returnTo=${returnTo}`)
    await screen.findByRole('option', { name: /Lucía Test/ })

    await fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    await waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/app/administracion/homologaciones?search=Luc%C3%ADa&estado=PENDIENTE&tipo=PARCIAL&carreraId=3&materiaId=14&page=2'))
  })

  it('bloquea el doble submit mientras la creación está pendiente', async () => {
    const pending = deferred<{ data: Homologation; message: string }>()
    vi.mocked(homologationsApi.create).mockReturnValueOnce(pending.promise)
    await renderView('/app/administracion/homologaciones/nueva')
    await screen.findByRole('option', { name: /Lucía Test/ })
    await fireEvent.update(screen.getByLabelText('Alumno activo'), '13')
    await fireEvent.update(screen.getByLabelText('Carrera activa'), '3')
    await fireEvent.update(screen.getByLabelText('Materia activa'), '14')
    await fireEvent.update(screen.getByLabelText('Nota de la institución anterior'), '8')

    const button = screen.getByRole('button', { name: 'Crear homologación' })
    await fireEvent.click(button)
    await fireEvent.click(button)
    expect(homologationsApi.create).toHaveBeenCalledTimes(1)
    expect(button).toBeDisabled()
    pending.resolve({ data: item({ id: 22 }), message: 'Solicitud creada' })
  })

  it('descarta un returnTo externo al navegar después de crear', async () => {
    const router = await renderView('/app/administracion/homologaciones/nueva?returnTo=https%3A%2F%2Fevil.example%2Fsteal')
    await screen.findByRole('option', { name: /Lucía Test/ })
    await fireEvent.update(screen.getByLabelText('Alumno activo'), '13')
    await fireEvent.update(screen.getByLabelText('Carrera activa'), '3')
    await fireEvent.update(screen.getByLabelText('Materia activa'), '14')
    await fireEvent.update(screen.getByLabelText('Nota de la institución anterior'), '8')
    await fireEvent.click(screen.getByRole('button', { name: 'Crear homologación' }))

    await waitFor(() => expect(router.currentRoute.value.name).toBe('admin-homologation-detail'))
    expect(router.currentRoute.value.query).toEqual({})
  })

  it('carga el detalle total pendiente y exige confirmación antes de aprobar', async () => {
    const pending = item({ id: 7, tipo: 'TOTAL', calificacion: 8 })
    const approved = item({ id: 7, tipo: 'TOTAL', estado: 'APROBADA', calificacion: 8 })
    vi.mocked(homologationsApi.getById).mockResolvedValueOnce(pending).mockResolvedValueOnce(approved)
    vi.mocked(homologationsApi.resolve).mockResolvedValueOnce({ data: approved, message: 'Solicitud aprobada' })
    const router = await renderView('/app/administracion/homologaciones/7?returnTo=%2Fapp%2Fadministracion%2Fhomologaciones%3Fpage%3D2')

    expect(await screen.findByRole('heading', { name: 'Detalle de homologación' })).toBeVisible()
    expect(screen.getByText(/Lucía Test/)).toBeVisible()
    const approve = screen.getByRole('button', { name: 'Aprobar homologación' })
    await fireEvent.click(approve)
    const dialog = await screen.findByRole('alertdialog', { name: 'Confirmar aprobación' })
    expect(homologationsApi.resolve).not.toHaveBeenCalled()
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Aprobar' }))

    await waitFor(() => expect(homologationsApi.resolve).toHaveBeenCalledWith(7, 'APROBAR'))
    expect(await screen.findByText('Solicitud aprobada y confirmada.')).toBeVisible()
    expect(await screen.findByText('Aprobada')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Aprobar homologación' })).not.toBeInTheDocument()
    expect(router.currentRoute.value.query).toEqual({ returnTo: '/app/administracion/homologaciones?page=2' })
  })

  it('restaura el foco al disparador al cancelar la confirmación', async () => {
    vi.mocked(homologationsApi.getById).mockResolvedValueOnce(item({ id: 19, tipo: 'TOTAL', calificacion: 8 }))
    await renderView('/app/administracion/homologaciones/19')
    const approve = await screen.findByRole('button', { name: 'Aprobar homologación' })
    await fireEvent.click(approve)
    const dialog = await screen.findByRole('alertdialog', { name: 'Confirmar aprobación' })
    const cancelButtons = within(dialog).getAllByRole('button', { name: 'Cancelar' })
    await fireEvent.click(cancelButtons[cancelButtons.length - 1])

    expect(document.activeElement).toBe(approve)
  })

  it('permite guardar notas parciales enteras de 0 a 10 y explica cuándo no alcanza', async () => {
    const empty = item({ id: 8, notaComplementaria: null })
    const insufficient = item({ id: 8, notaComplementaria: 0 })
    const sufficient = item({ id: 8, notaComplementaria: 6 })
    vi.mocked(homologationsApi.getById).mockResolvedValueOnce(empty).mockResolvedValueOnce(insufficient).mockResolvedValueOnce(sufficient)
    vi.mocked(homologationsApi.saveComplementaryGrade)
      .mockResolvedValueOnce({ data: insufficient, message: 'Nota guardada' })
      .mockResolvedValueOnce({ data: sufficient, message: 'Nota guardada' })
    await renderView('/app/administracion/homologaciones/8')

    const grade = await screen.findByLabelText('Nota del examen complementario')
    expect(screen.getByRole('button', { name: 'Aprobar homologación' })).toBeDisabled()
    expect(screen.getByText('Completá una nota complementaria entera entre 0 y 10 para habilitar la aprobación.')).toBeVisible()
    await fireEvent.update(grade, '0')
    await fireEvent.click(screen.getByRole('button', { name: 'Guardar nota complementaria' }))
    await waitFor(() => expect(homologationsApi.saveComplementaryGrade).toHaveBeenCalledWith(8, 0))
    expect(await screen.findByText('Nota complementaria guardada y confirmada.')).toBeVisible()
    expect(screen.getByLabelText('Nota del examen complementario')).toHaveValue(0)
    expect(screen.getByRole('button', { name: 'Aprobar homologación' })).toBeDisabled()
    expect(screen.getByText('La nota debe ser igual o mayor que 6 para aprobar.')).toBeVisible()

    await fireEvent.update(screen.getByLabelText('Nota del examen complementario'), '6')
    await fireEvent.click(screen.getByRole('button', { name: 'Guardar nota complementaria' }))
    await waitFor(() => expect(homologationsApi.saveComplementaryGrade).toHaveBeenLastCalledWith(8, 6))
    expect(await screen.findByText('Nota suficiente para aprobar.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Aprobar homologación' })).toBeEnabled()
  })

  it('conserva la nota y enfoca el campo si falla el guardado', async () => {
    vi.mocked(homologationsApi.saveComplementaryGrade).mockRejectedValueOnce(new ApiError('No se pudo guardar la nota.', 422, 'VALIDATION_ERROR'))
    await renderView('/app/administracion/homologaciones/9')
    const grade = await screen.findByLabelText('Nota del examen complementario')
    await fireEvent.update(grade, '4')
    await fireEvent.click(screen.getByRole('button', { name: 'Guardar nota complementaria' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar la nota.')
    expect(screen.getByLabelText('Nota del examen complementario')).toHaveValue(4)
    expect(document.activeElement).toBe(screen.getByLabelText('Nota del examen complementario'))
  })

  it('confirma rechazo, bloquea una segunda activación durante la solicitud y verifica el estado renderizado', async () => {
    const pending = item({ id: 10, tipo: 'TOTAL', calificacion: 5, estado: 'PENDIENTE' })
    const resolved = item({ id: 10, tipo: 'TOTAL', calificacion: null, estado: 'RECHAZADA' })
    const pendingResolve = deferred<{ data: Homologation; message: string }>()
    vi.mocked(homologationsApi.getById).mockResolvedValueOnce(pending).mockResolvedValueOnce(resolved)
    vi.mocked(homologationsApi.resolve).mockReturnValueOnce(pendingResolve.promise)
    await renderView('/app/administracion/homologaciones/10')
    const reject = await screen.findByRole('button', { name: 'Rechazar homologación' })
    await fireEvent.click(reject)
    const dialog = await screen.findByRole('alertdialog', { name: 'Confirmar rechazo' })
    const confirm = within(dialog).getByRole('button', { name: 'Rechazar' })
    await fireEvent.click(confirm)

    expect(homologationsApi.resolve).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(reject).toBeDisabled())
    await fireEvent.click(reject)
    expect(homologationsApi.resolve).toHaveBeenCalledTimes(1)
    pendingResolve.resolve({ data: resolved, message: 'Solicitud rechazada' })

    expect(await screen.findByText('Rechazada')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Rechazar homologación' })).not.toBeInTheDocument()
  })

  it.each([
    { estado: 'APROBADA' as const, accion: 'APROBAR' as const, button: 'Aprobar homologación', dialog: 'Confirmar aprobación', confirm: 'Aprobar' },
    { estado: 'RECHAZADA' as const, accion: 'RECHAZAR' as const, button: 'Rechazar homologación', dialog: 'Confirmar rechazo', confirm: 'Rechazar' },
  ])('tras un 409 recarga un estado $estado y enfoca el resumen si desaparece la acción', async ({ estado, accion, button, dialog: dialogName, confirm }) => {
    const pending = item({ id: estado === 'APROBADA' ? 16 : 17, tipo: 'TOTAL', calificacion: 8, estado: 'PENDIENTE' })
    const resolved = item({ id: pending.id, tipo: 'TOTAL', calificacion: estado === 'APROBADA' ? 8 : null, estado })
    vi.mocked(homologationsApi.getById).mockResolvedValueOnce(pending).mockResolvedValueOnce(resolved)
    vi.mocked(homologationsApi.resolve).mockRejectedValueOnce(new ApiError('Conflicto de estado.', 409, 'CONFLICT'))
    await renderView(`/app/administracion/homologaciones/${pending.id}`)
    await fireEvent.click(await screen.findByRole('button', { name: button }))
    const dialogElement = await screen.findByRole('alertdialog', { name: dialogName })
    await fireEvent.click(within(dialogElement).getByRole('button', { name: confirm }))

    expect(homologationsApi.resolve).toHaveBeenCalledWith(pending.id, accion)
    expect((await screen.findAllByRole('alert')).some((element) => element.textContent?.includes('Conflicto de estado.'))).toBe(true)
    expect(await screen.findByText(estado === 'APROBADA' ? 'Aprobada' : 'Rechazada')).toBeVisible()
    expect(screen.queryByRole('button', { name: button })).not.toBeInTheDocument()
    expect(document.activeElement).toBe(document.querySelector('[data-detail-summary]'))
  })

  it('conserva el detalle y evita anunciar éxito si falla el GET posterior a guardar', async () => {
    const pending = item({ id: 18, notaComplementaria: null })
    vi.mocked(homologationsApi.getById).mockResolvedValueOnce(pending).mockRejectedValueOnce(new ApiError('No pudimos recargar.', 500, 'HTTP_ERROR'))
    vi.mocked(homologationsApi.saveComplementaryGrade).mockResolvedValueOnce({ data: item({ id: 18, notaComplementaria: 4 }), message: 'Nota guardada' })
    await renderView('/app/administracion/homologaciones/18')
    const grade = await screen.findByLabelText('Nota del examen complementario')
    await fireEvent.update(grade, '4')
    await fireEvent.click(screen.getByRole('button', { name: 'Guardar nota complementaria' }))

    expect(await screen.findByText('La nota complementaria no pudo confirmarse. El detalle queda en modo de consulta hasta una recarga exitosa. Reintentá cargar el detalle.')).toBeVisible()
    expect(screen.queryByText('Nota complementaria guardada y confirmada.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Nota del examen complementario')).toHaveValue(4)
    expect(screen.getByRole('button', { name: 'Reintentar carga del detalle' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Guardar nota complementaria' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Rechazar homologación' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Aprobar homologación' })).toBeDisabled()
    expect(screen.queryByText('Guardando…')).not.toBeInTheDocument()
    await fireEvent.submit(screen.getByLabelText('Nota del examen complementario').closest('form') as HTMLFormElement)
    await fireEvent.click(screen.getByRole('button', { name: 'Rechazar homologación' }))
    expect(homologationsApi.saveComplementaryGrade).toHaveBeenCalledTimes(1)
    expect(homologationsApi.resolve).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(document.querySelector('[data-detail-feedback]'))
  })

  it.each([
    { caso: 'pendiente insuficiente', estado: 'PENDIENTE' as const, nota: 4, permiteAprobar: false },
    { caso: 'pendiente suficiente', estado: 'PENDIENTE' as const, nota: 6, permiteAprobar: true },
    { caso: 'aprobada', estado: 'APROBADA' as const, nota: 6, permiteAprobar: false },
    { caso: 'rechazada', estado: 'RECHAZADA' as const, nota: 4, permiteAprobar: false },
  ])('el reintento de consulta restaura sólo acciones admitidas: $caso', async ({ estado, nota, permiteAprobar }) => {
    const recarga = deferred<Homologation>()
    vi.mocked(homologationsApi.getById)
      .mockResolvedValueOnce(item({ id: 18 }))
      .mockRejectedValueOnce(new ApiError('No pudimos recargar.', 500, 'HTTP_ERROR'))
      .mockReturnValueOnce(recarga.promise)
    await renderView('/app/administracion/homologaciones/18')
    await fireEvent.update(await screen.findByLabelText('Nota del examen complementario'), '4')
    await fireEvent.click(screen.getByRole('button', { name: 'Guardar nota complementaria' }))
    const reintentar = await screen.findByRole('button', { name: 'Reintentar carga del detalle' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar nota complementaria' })).toBeDisabled())
    await fireEvent.click(reintentar)
    expect(screen.getByRole('button', { name: 'Guardar nota complementaria' })).toBeDisabled()
    expect(screen.getByLabelText('Nota del examen complementario')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Rechazar homologación' })).toBeDisabled()
    expect(screen.queryByText('Guardando…')).not.toBeInTheDocument()
    recarga.resolve(item({ id: 18, estado, notaComplementaria: nota, calificacion: estado === 'APROBADA' ? nota : null }))

    expect(await screen.findByText('Detalle actualizado.')).toBeVisible()
    if (estado === 'PENDIENTE') {
      expect(screen.getByRole('button', { name: 'Guardar nota complementaria' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Rechazar homologación' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Aprobar homologación' }).hasAttribute('disabled')).toBe(!permiteAprobar)
    } else {
      expect(screen.queryByLabelText('Nota del examen complementario')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Aprobar homologación' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Rechazar homologación' })).not.toBeInTheDocument()
    }
    expect(screen.getAllByText('Detalle actualizado.')).toHaveLength(1)
    expect(document.activeElement).toBe(document.querySelector('[data-detail-feedback]'))
  })

  it('oculta el detalle anterior ante un 404 del GET posterior a una mutación', async () => {
    const pending = item({ id: 20, notaComplementaria: null })
    vi.mocked(homologationsApi.getById).mockResolvedValueOnce(pending).mockRejectedValueOnce(new ApiError('No existe.', 404, 'NOT_FOUND'))
    vi.mocked(homologationsApi.saveComplementaryGrade).mockResolvedValueOnce({ data: item({ id: 20, notaComplementaria: 4 }), message: 'Nota guardada' })
    await renderView('/app/administracion/homologaciones/20')
    const grade = await screen.findByLabelText('Nota del examen complementario')
    await fireEvent.update(grade, '4')
    await fireEvent.click(screen.getByRole('button', { name: 'Guardar nota complementaria' }))

    expect(await screen.findByText('La nota complementaria no pudo confirmarse porque el detalle ya no está disponible. Reintentá cargar el detalle.')).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Detalle de homologación' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rechazar homologación' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Nota del examen complementario')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'No encontramos esta homologación.' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Reintentar carga del detalle' })).toBeVisible()
    expect(document.activeElement).toBe(document.querySelector('[data-detail-feedback]'))
  })

  it('deja aprobadas y rechazadas estrictamente en modo de sólo lectura', async () => {
    for (const estado of ['APROBADA', 'RECHAZADA'] as const) {
      vi.mocked(homologationsApi.getById).mockResolvedValueOnce(item({ id: estado === 'APROBADA' ? 11 : 12, estado, tipo: 'PARCIAL', notaComplementaria: 7, calificacion: estado === 'APROBADA' ? 7 : null }))
      await renderView(`/app/administracion/homologaciones/${estado === 'APROBADA' ? 11 : 12}`)
      await screen.findByRole('heading', { name: 'Detalle de homologación' })
      expect(screen.queryByLabelText('Nota del examen complementario')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Guardar nota complementaria' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Aprobar homologación' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Rechazar homologación' })).not.toBeInTheDocument()
    }
  })

  it('descarta el detalle anterior cuando cambia el ID de la ruta', async () => {
    const oldResponse = deferred<Homologation>()
    const newer = item({ id: 14, alumno: { ...item().alumno, apellidoNombre: 'Detalle nuevo' } })
    vi.mocked(homologationsApi.getById).mockReturnValueOnce(oldResponse.promise).mockResolvedValueOnce(newer)
    const router = await renderView('/app/administracion/homologaciones/13')
    await router.push('/app/administracion/homologaciones/14')
    expect(await screen.findByText(/^Detalle nuevo · DNI 42666888$/)).toBeVisible()
    oldResponse.resolve(item({ id: 13, alumno: { ...item().alumno, apellidoNombre: 'Detalle viejo' } }))
    await Promise.resolve()
    expect(screen.queryByText(/^Detalle viejo · DNI 42666888$/)).not.toBeInTheDocument()
    expect(homologationsApi.getById).toHaveBeenLastCalledWith(14)
  })

  it('muestra 404 con Volver y usa el retorno interno normalizado o el listado por defecto', async () => {
    vi.mocked(homologationsApi.getById).mockRejectedValueOnce(new ApiError('Homologación inexistente.', 404, 'NOT_FOUND'))
    const router = await renderView('/app/administracion/homologaciones/404?returnTo=https%3A%2F%2Fevil.example%2Fsteal')
    expect(await screen.findByRole('alert')).toHaveTextContent('No encontramos esta homologación.')
    await fireEvent.click(screen.getByRole('button', { name: 'Volver a homologaciones' }))
    await waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/app/administracion/homologaciones'))
  })

  it('normaliza un returnTo interno y conserva sólo la allowlist de filtros', async () => {
    vi.mocked(homologationsApi.getById).mockRejectedValueOnce(new ApiError('No existe.', 404, 'NOT_FOUND'))
    const returnTo = encodeURIComponent('/app/administracion/homologaciones?search=%20Luc%C3%ADa%20&estado=PENDIENTE&tipo=PARCIAL&carreraId=3&materiaId=14&page=2&sort=createdAt')
    const router = await renderView(`/app/administracion/homologaciones/405?returnTo=${returnTo}`)
    await screen.findByRole('alert')
    await fireEvent.click(screen.getByRole('button', { name: 'Volver a homologaciones' }))

    await waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/app/administracion/homologaciones?search=Luc%C3%ADa&estado=PENDIENTE&tipo=PARCIAL&carreraId=3&materiaId=14&page=2'))
  })

  it('rechaza un returnTo interno con hash y vuelve al listado limpio', async () => {
    vi.mocked(homologationsApi.getById).mockRejectedValueOnce(new ApiError('No existe.', 404, 'NOT_FOUND'))
    const returnTo = encodeURIComponent('/app/administracion/homologaciones?estado=PENDIENTE&page=2#detalle')
    const router = await renderView(`/app/administracion/homologaciones/406?returnTo=${returnTo}`)
    await screen.findByRole('alert')
    await fireEvent.click(screen.getByRole('button', { name: 'Volver a homologaciones' }))

    await waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/app/administracion/homologaciones'))
  })

  it('recarga el detalle después de un conflicto 409', async () => {
    const refreshed = item({ id: 15, tipo: 'TOTAL', estado: 'APROBADA', calificacion: 8 })
    vi.mocked(homologationsApi.getById).mockRejectedValueOnce(new ApiError('Cambió en otra sesión.', 409, 'CONFLICT')).mockResolvedValueOnce(refreshed)
    const router = await renderView('/app/administracion/homologaciones/15')
    expect(await screen.findByText('Cambió en otra sesión.')).toBeVisible()
    expect(await screen.findByText('Aprobada')).toBeVisible()
    expect(homologationsApi.getById).toHaveBeenCalledTimes(2)
    expect(router.currentRoute.value.name).toBe('admin-homologation-detail')
  })
})
