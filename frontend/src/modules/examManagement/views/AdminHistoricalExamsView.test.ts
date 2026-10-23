import { fireEvent, render, screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminHistoricalExamsView from './AdminHistoricalExamsView.vue'

const mocks = vi.hoisted(() => ({ get: vi.fn(), getPaginated: vi.fn(), post: vi.fn(), request: vi.fn() }))

vi.mock('@/core/api/client', () => ({ apiClient: mocks }))

const historicRecord = {
  id: 91,
  alumnoId: 42,
  nombreAlumno: 'Lucía Fernández',
  carreraId: 3,
  nombreCarrera: 'Profesorado de Historia',
  materiaId: 8,
  cursadaId: 70,
  nombreMateria: 'Historia Argentina',
  cicloLectivo: 2001,
  fechaExamen: '2001-11-14',
  notaFinal: 7,
  libro: 'Libro 2',
  folio: '18',
  version: 4,
}

const student = (idUsuario = 42, apellidoNombre = 'Lucía Fernández') => ({
  idUsuario,
  apellidoNombre,
  dni: idUsuario === 42 ? '42666888' : '40123456',
  email: 'alumna@example.test',
  activo: true,
})
const career = (id = 3, nombre = 'Profesorado de Historia') => ({
  id,
  carreraId: id,
  activo: true,
  carrera: { id, nombre, activo: true },
})
const subject = (id = 8, carreraId = 3, nombre = 'Historia Argentina') => ({ id, carreraId, nombre, activo: true })
const page = <T,>(data: T[]) => ({ data, pagination: { page: 1, limit: 100, total: data.length, totalPages: data.length ? 1 : 0 } })
type CourseOptionForTest = { id: number; materiaId: number; materia: { id: number; nombre: string }; anioLectivo: number; periodo: string }
type CoursePageForTest = ReturnType<typeof page<CourseOptionForTest>>

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

describe('AdminHistoricalExamsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.get.mockImplementation((path: string) => {
      if (path.startsWith('/examenes/historicos')) return Promise.resolve([historicRecord])
      if (path.startsWith('/promociones-historicas')) return Promise.resolve({ items: [] })
      if (path.startsWith('/inscripciones-carreras/alumno/42')) return Promise.resolve([career()])
      if (path.startsWith('/inscripciones-carreras/alumno/52')) return Promise.resolve([career(6, 'Profesorado de Letras')])
      return Promise.resolve([])
    })
    mocks.getPaginated.mockImplementation((path: string) => {
      const url = new URL(path, 'http://local')
      if (url.pathname === '/users') {
        const search = url.searchParams.get('search') ?? ''
        return Promise.resolve(page(search.toLowerCase().startsWith('lu') ? [student()] : [student(52, 'Ana Pérez')]))
      }
      if (url.pathname === '/materias') {
        const carreraId = Number(url.searchParams.get('carreraId'))
        return Promise.resolve(page(carreraId === 3 ? [subject()] : [subject(18, carreraId, 'Literatura')]))
      }
      if (url.pathname === '/cursadas') {
        return Promise.resolve(page([{ id: 70, materiaId: 8, materia: { id: 8, nombre: 'Historia Argentina', notaMinima: 6 }, anioLectivo: 2001, periodo: 'ANUAL' }]))
      }
      return Promise.resolve(page([]))
    })
    mocks.post.mockResolvedValue(historicRecord)
    mocks.request.mockResolvedValue({ ...historicRecord, notaFinal: 8, version: 5 })
  })

  it('presents names instead of ID fields for selecting students, careers and subjects', async () => {
    render(AdminHistoricalExamsView)

    expect(screen.getByLabelText('Alumno', { selector: '#historic-create-student' })).toBeInTheDocument()
    expect(screen.getByLabelText('Carrera', { selector: '#historic-create-career' })).toBeInTheDocument()
    expect(screen.getByLabelText('Materia', { selector: '#historic-create-subject' })).toBeInTheDocument()
    expect(screen.queryByLabelText('ID de alumno')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('ID de carrera')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('ID de materia')).not.toBeInTheDocument()
    await screen.findByText('Buscá un alumno para consultar sus calificaciones históricas.')
  })

  it('loads the chained historical options and posts the selected account and matching subject IDs', async () => {
    const user = userEvent.setup()
    render(AdminHistoricalExamsView)

    await user.type(screen.getByLabelText('Buscar alumno', { selector: '#historic-create-student-search' }), 'Lucía')
    await waitFor(() => expect(mocks.getPaginated).toHaveBeenCalledWith('/users?rol=ALUMNO&search=Luc%C3%ADa&page=1&limit=100'))
    await user.selectOptions(screen.getByLabelText('Alumno', { selector: '#historic-create-student' }), '42')
    await screen.findByRole('option', { name: 'Profesorado de Historia' })
    expect(mocks.get).toHaveBeenCalledWith('/inscripciones-carreras/alumno/42?includeInactive=true')

    await user.selectOptions(screen.getByLabelText('Carrera', { selector: '#historic-create-career' }), '3')
    await screen.findByRole('option', { name: 'Historia Argentina' })
    expect(mocks.getPaginated).toHaveBeenCalledWith('/materias?carreraId=3&page=1&limit=100')
    await user.selectOptions(screen.getByLabelText('Materia', { selector: '#historic-create-subject' }), '8')
    await user.selectOptions(screen.getByLabelText('Ciclo lectivo', { selector: '#historic-create-cycle' }), '2001')
    await user.selectOptions(await screen.findByLabelText('Cursada existente', { selector: '#historic-create-course' }), '70')
    await user.type(screen.getByLabelText('Fecha del examen'), '2001-11-14')
    await user.type(screen.getByLabelText('Nota final', { selector: '#historic-create-grade' }), '7')
    await user.click(screen.getByRole('button', { name: /^Guardar calificación$/ }))

    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/examenes/historicos', {
      alumnoId: 42,
      cursadaId: 70,
      materiaId: 8,
      cicloLectivo: 2001,
      fechaExamen: '2001-11-14',
      notaFinal: 7,
    }))
    expect(await screen.findByRole('status')).toHaveTextContent('La calificación histórica de examen final se registró.')
  })

  it('searches every page of matching students instead of stopping at the first catalog page', async () => {
    const user = userEvent.setup()
    const firstPage = Array.from({ length: 100 }, (_, index) => student(1000 + index, `Apellido ${index}`))
    const lastStudent = student(2000, 'Apellido encontrado')
    mocks.getPaginated.mockImplementation((path: string) => {
      const url = new URL(path, 'http://local')
      if (url.pathname !== '/users') return Promise.resolve(page([]))
      const currentPage = Number(url.searchParams.get('page'))
      return Promise.resolve({
        data: currentPage === 1 ? firstPage : [lastStudent],
        pagination: { page: currentPage, limit: 100, total: 101, totalPages: 2 },
      })
    })
    render(AdminHistoricalExamsView)

    await user.type(screen.getByLabelText('Buscar alumno', { selector: '#historic-create-student-search' }), 'Apellido')

    expect(await screen.findByRole('option', { name: 'Apellido encontrado · DNI 40123456' })).toBeInTheDocument()
    expect(mocks.getPaginated).toHaveBeenCalledWith('/users?rol=ALUMNO&search=Apellido&page=2&limit=100')
  })

  it('clears dependent selections and ignores a career response that arrives after the student changed', async () => {
    const user = userEvent.setup()
    const firstCareer = deferred<ReturnType<typeof career>[]>()
    mocks.get.mockImplementation((path: string) => {
      if (path.startsWith('/examenes/historicos')) return Promise.resolve([])
      if (path.startsWith('/inscripciones-carreras/alumno/52')) return firstCareer.promise
      if (path.startsWith('/inscripciones-carreras/alumno/42')) return Promise.resolve([career(3, 'Carrera de Lucía')])
      return Promise.resolve([])
    })
    render(AdminHistoricalExamsView)

    await user.type(screen.getByLabelText('Buscar alumno', { selector: '#historic-create-student-search' }), 'Ana')
    await waitFor(() => expect(mocks.getPaginated).toHaveBeenCalled())
    await user.selectOptions(screen.getByLabelText('Alumno', { selector: '#historic-create-student' }), '52')
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith('/inscripciones-carreras/alumno/52?includeInactive=true'))

    await user.clear(screen.getByLabelText('Buscar alumno', { selector: '#historic-create-student-search' }))
    expect(screen.getByLabelText('Alumno', { selector: '#historic-create-student' })).toHaveValue('')
    expect(screen.getByLabelText('Carrera', { selector: '#historic-create-career' })).toHaveValue('')
    expect(screen.getByLabelText('Materia', { selector: '#historic-create-subject' })).toHaveValue('')
    await user.type(screen.getByLabelText('Buscar alumno', { selector: '#historic-create-student-search' }), 'Lucía')
    await waitFor(() => expect(mocks.getPaginated).toHaveBeenCalledTimes(2))
    await user.selectOptions(screen.getByLabelText('Alumno', { selector: '#historic-create-student' }), '42')
    await screen.findByRole('option', { name: 'Carrera de Lucía' })
    await user.selectOptions(screen.getByLabelText('Carrera', { selector: '#historic-create-career' }), '3')
    await user.selectOptions(await screen.findByLabelText('Materia', { selector: '#historic-create-subject' }), '8')

    firstCareer.resolve([career(6, 'Carrera de Ana')])

    await waitFor(() => expect(screen.getByLabelText('Alumno', { selector: '#historic-create-student' })).toHaveValue('42'))
    expect(screen.getByLabelText('Carrera', { selector: '#historic-create-career' })).toHaveValue('3')
    expect(screen.getByLabelText('Materia', { selector: '#historic-create-subject' })).toHaveValue('8')
    expect(screen.queryByRole('option', { name: 'Carrera de Ana' })).not.toBeInTheDocument()
  })

  it('invalidates a pending course lookup when the selected student changes', async () => {
    const user = userEvent.setup()
    const oldCourses = deferred<CoursePageForTest>()
    mocks.get.mockImplementation((path: string) => {
      if (path.startsWith('/examenes/historicos') || path.startsWith('/promociones-historicas')) return Promise.resolve(path.startsWith('/promociones') ? { items: [] } : [])
      if (path.startsWith('/inscripciones-carreras/alumno/42')) return Promise.resolve([career()])
      if (path.startsWith('/inscripciones-carreras/alumno/52')) return Promise.resolve([career(6, 'Profesorado de Letras')])
      return Promise.resolve([])
    })
    mocks.getPaginated.mockImplementation((path: string) => {
      const url = new URL(path, 'http://local')
      if (url.pathname === '/users') return Promise.resolve(page((url.searchParams.get('search') ?? '').startsWith('Lu') ? [student()] : [student(52, 'Ana Pérez')]))
      if (url.pathname === '/materias') {
        const careerId = Number(url.searchParams.get('carreraId'))
        return Promise.resolve(page(careerId === 3 ? [subject()] : [subject(18, 6, 'Literatura')]))
      }
      if (url.pathname === '/cursadas') {
        return Number(url.searchParams.get('materiaId')) === 8
          ? oldCourses.promise
          : Promise.resolve(page([{ id: 180, materiaId: 18, materia: { id: 18, nombre: 'Literatura' }, anioLectivo: 2005, periodo: 'ANUAL' }]))
      }
      return Promise.resolve(page([]))
    })
    render(AdminHistoricalExamsView)

    await user.type(screen.getByLabelText('Buscar alumno', { selector: '#historic-create-student-search' }), 'Lucía')
    await screen.findByRole('option', { name: 'Lucía Fernández · DNI 42666888' })
    await user.selectOptions(await screen.findByLabelText('Alumno', { selector: '#historic-create-student' }), '42')
    await user.selectOptions(await screen.findByLabelText('Carrera', { selector: '#historic-create-career' }), '3')
    await user.selectOptions(await screen.findByLabelText('Materia', { selector: '#historic-create-subject' }), '8')
    await waitFor(() => expect(mocks.getPaginated).toHaveBeenCalledWith('/cursadas?materiaId=8&page=1&limit=100'))

    await user.clear(screen.getByLabelText('Buscar alumno', { selector: '#historic-create-student-search' }))
    await user.type(screen.getByLabelText('Buscar alumno', { selector: '#historic-create-student-search' }), 'Ana')
    await screen.findByRole('option', { name: 'Ana Pérez · DNI 40123456' })
    await waitFor(() => expect(screen.getByLabelText('Alumno', { selector: '#historic-create-student' })).toBeEnabled())
    await user.selectOptions(await screen.findByLabelText('Alumno', { selector: '#historic-create-student' }), '52')
    await user.selectOptions(await screen.findByLabelText('Carrera', { selector: '#historic-create-career' }), '6')
    await user.selectOptions(await screen.findByLabelText('Materia', { selector: '#historic-create-subject' }), '18')
    expect(await screen.findByRole('option', { name: '2005' })).toBeInTheDocument()

    oldCourses.resolve(page([{ id: 80, materiaId: 8, materia: { id: 8, nombre: 'Historia Argentina' }, anioLectivo: 2001, periodo: 'ANUAL' }]))
    await waitFor(() => expect(screen.queryByRole('option', { name: '2001' })).not.toBeInTheDocument())
    expect(screen.getByLabelText('Ciclo lectivo', { selector: '#historic-create-cycle' })).toHaveValue('')
  })

  it('closes the correction form when changing the student filter invalidates the visible records', async () => {
    const user = userEvent.setup()
    render(AdminHistoricalExamsView)

    await user.type(screen.getByLabelText('Buscar alumno', { selector: '#historic-filter-student-search' }), 'Lucía')
    await screen.findByRole('option', { name: 'Lucía Fernández · DNI 42666888' })
    await user.selectOptions(screen.getByLabelText('Alumno', { selector: '#historic-filter-student' }), '42')
    await user.click(screen.getByRole('button', { name: 'Buscar' }))
    await user.click(within(screen.getByTestId('historical-record-cards')).getByRole('button', { name: 'Corregir calificación de Lucía Fernández · Historia Argentina' }))
    expect(screen.getByRole('heading', { name: 'Corregir calificación: Lucía Fernández · Historia Argentina' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('Buscar alumno', { selector: '#historic-filter-student-search' }), 'Lu')

    expect(screen.queryByRole('heading', { name: 'Corregir calificación: Lucía Fernández · Historia Argentina' })).not.toBeInTheDocument()
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it('sends the displayed version and required reason when correcting a historical result', async () => {
    const user = userEvent.setup()
    render(AdminHistoricalExamsView)

    await user.type(screen.getByLabelText('Buscar alumno', { selector: '#historic-filter-student-search' }), 'Lucía')
    await screen.findByRole('option', { name: 'Lucía Fernández · DNI 42666888' })
    await user.selectOptions(screen.getByLabelText('Alumno', { selector: '#historic-filter-student' }), '42')
    await user.click(screen.getByRole('button', { name: 'Buscar' }))
    await user.click(within(screen.getByTestId('historical-record-cards')).getByRole('button', { name: 'Corregir calificación de Lucía Fernández · Historia Argentina' }))
    fireEvent.update(screen.getAllByLabelText('Nota final')[1], '8')
    fireEvent.update(screen.getByLabelText('Motivo de la corrección'), 'Rectificación del acta original')
    await user.click(screen.getByRole('button', { name: 'Guardar corrección' }))

    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith('/examenes/historicos/91', {
      method: 'PATCH',
      body: { notaFinal: 8, libro: 'Libro 2', folio: '18', motivo: 'Rectificación del acta original', expectedVersion: 4 },
    }))
  })

  it('creates an approved historical promotion for an existing course and requires its configured passing grade', async () => {
    const user = userEvent.setup()
    render(AdminHistoricalExamsView)
    await user.type(screen.getByLabelText('Buscar alumno', { selector: '#historic-create-student-search' }), 'Lucía')
    await screen.findByRole('option', { name: 'Lucía Fernández · DNI 42666888' })
    await user.selectOptions(screen.getByLabelText('Alumno', { selector: '#historic-create-student' }), '42')
    await screen.findByRole('option', { name: 'Profesorado de Historia' })
    await user.selectOptions(screen.getByLabelText('Carrera', { selector: '#historic-create-career' }), '3')
    await screen.findByRole('option', { name: 'Historia Argentina' })
    await user.selectOptions(screen.getByLabelText('Materia', { selector: '#historic-create-subject' }), '8')
    await screen.findByRole('option', { name: '2001' })
    await user.selectOptions(screen.getByLabelText('Ciclo lectivo', { selector: '#historic-create-cycle' }), '2001')
    await user.selectOptions(await screen.findByLabelText('Cursada existente', { selector: '#historic-create-course' }), '70')
    await user.selectOptions(screen.getByLabelText('Vía de aprobación'), 'PROMOCIONADA')
    await user.type(screen.getByLabelText('Fecha de acreditación'), '2001-11-14')
    await user.type(screen.getByLabelText('Nota de aprobación'), '5')
    await user.click(screen.getByRole('button', { name: /^Guardar calificación$/ }))
    expect(mocks.post).not.toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toHaveTextContent('La promoción requiere una nota aprobatoria de 6 o más.')

    await user.clear(screen.getByLabelText('Nota de aprobación'))
    await user.type(screen.getByLabelText('Nota de aprobación'), '6')
    await user.click(screen.getByRole('button', { name: /^Guardar calificación$/ }))
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/promociones-historicas', {
      cursadaId: 70, alumnoId: 42, notaFinal: 6, fechaAcreditacion: '2001-11-14',
    }))
  })
})
