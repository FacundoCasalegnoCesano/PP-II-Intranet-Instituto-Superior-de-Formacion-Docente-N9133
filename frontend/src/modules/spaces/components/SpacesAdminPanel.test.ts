import { render, screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SpacesAdminPanel from './SpacesAdminPanel.vue'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  getMateria: vi.fn(),
  getPaginated: vi.fn(),
  list: vi.fn(),
  prerequisites: vi.fn(),
  addPrerequisite: vi.fn(),
  removePrerequisite: vi.fn(),
  activate: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}))

vi.mock('@/core/api/client', () => ({ apiClient: { get: mocks.getMateria, getPaginated: mocks.getPaginated } }))
vi.mock('../api/spacesApi', () => ({ spacesApi: {
  list: mocks.list, get: mocks.get, prerequisites: mocks.prerequisites,
  addPrerequisite: mocks.addPrerequisite, removePrerequisite: mocks.removePrerequisite,
  activate: mocks.activate, create: mocks.create, update: mocks.update, remove: mocks.remove,
} }))

const space = {
  id: 8, nombre: 'Campo de la Práctica', carreraId: 3, descripcion: null, activo: true,
  composicionBloqueadaAt: null, carrera: { id: 3, nombre: 'Profesorado' },
  materias: [{ id: 10, nombre: 'Práctica I' }, { id: 11, nombre: 'Práctica II' }],
}

describe('SpacesAdminPanel Prisma response compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getMateria.mockResolvedValue({ nombre: 'Materia', correlatividadesOrigen: [] })
    mocks.list.mockResolvedValue([space])
    mocks.get.mockResolvedValue(space)
    mocks.prerequisites.mockResolvedValue([])
    mocks.addPrerequisite.mockResolvedValue({ id: 5 })
    mocks.getPaginated.mockImplementation(async (path: string) => path.startsWith('/carreras')
      ? { data: [{ id: 3, nombre: 'Profesorado' }] }
      : { data: [
        { id: 10, nombre: 'Práctica I', carreraId: 3, activo: true },
        { id: 11, nombre: 'Práctica II', carreraId: 3, activo: true },
        { id: 12, nombre: 'Pedagogía', carreraId: 3, activo: true },
      ] })
  })

  it('reads existing requirements and adds a materia with the shared default rule', async () => {
    const user = userEvent.setup()
    render(SpacesAdminPanel)

    const open = await screen.findByRole('button', { name: /Campo de la Práctica.*Profesorado.*Activo/ })
    await user.click(open)
    expect(await screen.findByText('Materia: Práctica I')).toBeInTheDocument()
    expect(screen.getByText('Materia: Práctica II')).toBeInTheDocument()

    await user.selectOptions(await screen.findByLabelText('Correlativa'), 'materia:12')
    await user.click(screen.getByRole('button', { name: /^Agregar$/ }))

    await waitFor(() => expect(mocks.addPrerequisite).toHaveBeenCalledWith(8, {
      materiaRequeridaId: 12, aplicaCursado: false, aplicaRendir: true,
    }))
  })

  it('keeps the edited space components selected and hides components assigned to another space', async () => {
    const user = userEvent.setup()
    const otherSpace = {
      ...space, id: 9, nombre: 'Otro espacio', materias: [{ id: 13, nombre: 'Práctica III' }],
    }
    mocks.list.mockResolvedValue([space, otherSpace])
    mocks.getPaginated.mockImplementation(async (path: string) => path.startsWith('/carreras')
      ? { data: [{ id: 3, nombre: 'Profesorado' }] }
      : { data: [
        { id: 10, nombre: 'Práctica I', carreraId: 3, activo: true },
        { id: 11, nombre: 'Práctica II', carreraId: 3, activo: true },
        { id: 12, nombre: 'Pedagogía', carreraId: 3, activo: true },
        { id: 13, nombre: 'Práctica III', carreraId: 3, activo: true },
      ] })

    render(SpacesAdminPanel)
    const editButtons = await screen.findAllByRole('button', { name: 'Editar' })
    await user.click(editButtons[0]!)

    expect(await screen.findByRole('checkbox', { name: 'Materia: Práctica I' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Materia: Práctica II' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Materia: Pedagogía' })).not.toBeChecked()
    expect(screen.queryByRole('checkbox', { name: 'Materia: Práctica III' })).not.toBeInTheDocument()
  })

  it('creates the space and its typed prerequisites in one request', async () => {
    const user = userEvent.setup()
    mocks.list.mockResolvedValue([])
    render(SpacesAdminPanel)
    await user.click(await screen.findByRole('button', { name: 'Nuevo espacio curricular' }))
    await user.type(screen.getByLabelText('Nombre'), 'Espacio Integrador')
    await user.selectOptions(screen.getByLabelText('Carrera'), '3')
    await user.click(await screen.findByRole('checkbox', { name: 'Materia: Práctica I' }))
    await user.click(screen.getByRole('checkbox', { name: 'Materia: Práctica II' }))
    await user.click(screen.getByRole('checkbox', { name: 'Tiene correlativas' }))
    await user.selectOptions(await screen.findByLabelText('Correlativa'), 'materia:12')
    await user.click(screen.getByRole('button', { name: /^Agregar$/ }))
    await user.click(screen.getByRole('button', { name: 'Guardar espacio' }))

    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({
      nombre: 'Espacio Integrador', carreraId: 3, descripcion: '', componentesIds: [10, 11],
      correlatividades: [{ materiaRequeridaId: 12, aplicaCursado: false, aplicaRendir: true }],
    }))
    expect(mocks.addPrerequisite).not.toHaveBeenCalled()
  })

  it('requires one component and creates a single-component space without an activation step', async () => {
    const user = userEvent.setup()
    const created = { ...space, id: 20, nombre: 'Espacio de una materia', materias: [space.materias[0]] }
    mocks.list.mockResolvedValueOnce([]).mockResolvedValue([created])
    mocks.create.mockResolvedValue(created)
    render(SpacesAdminPanel)
    await user.click(await screen.findByRole('button', { name: 'Nuevo espacio curricular' }))
    await user.type(screen.getByLabelText('Nombre'), created.nombre)
    await user.selectOptions(screen.getByLabelText('Carrera'), '3')
    await user.click(await screen.findByRole('checkbox', { name: 'Materia: Práctica I' }))
    await user.click(screen.getByRole('button', { name: 'Guardar espacio' }))

    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      nombre: created.nombre, carreraId: 3, componentesIds: [10],
    })))
    expect(screen.queryByRole('button', { name: 'Activar' })).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Espacio de una materia.*Activo/ })).toBeInTheDocument()
  })

  it('does not submit a space without components', async () => {
    const user = userEvent.setup()
    render(SpacesAdminPanel)
    await user.click(await screen.findByRole('button', { name: 'Nuevo espacio curricular' }))
    await user.type(screen.getByLabelText('Nombre'), 'Espacio vacío')
    await user.selectOptions(screen.getByLabelText('Carrera'), '3')
    await user.click(screen.getByRole('button', { name: 'Guardar espacio' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/al menos una materia/i)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('cancels the delete confirmation without calling the API', async () => {
    const user = userEvent.setup()
    render(SpacesAdminPanel)
    await user.click(await screen.findByRole('button', { name: /Campo de la Práctica.*Activo/ }))
    await user.click(await screen.findByRole('button', { name: 'Borrar espacio' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Eliminar espacio curricular' })
    expect(dialog).toHaveTextContent('Campo de la Práctica')
    await user.click(within(dialog).getAllByRole('button', { name: 'Cancelar' })[1])
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(mocks.remove).not.toHaveBeenCalled()
  })

  it('keeps the selected space and confirmation open when deletion is blocked', async () => {
    const user = userEvent.setup()
    mocks.remove.mockRejectedValueOnce(new Error('No se puede eliminar: tiene inscripciones asociadas.'))
    render(SpacesAdminPanel)
    await user.click(await screen.findByRole('button', { name: /Campo de la Práctica.*Activo/ }))
    await user.click(await screen.findByRole('button', { name: 'Borrar espacio' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Eliminar espacio curricular' })
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar espacio' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('tiene inscripciones asociadas')
    expect(screen.getByRole('button', { name: /Campo de la Práctica.*Activo/ })).toBeInTheDocument()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('deletes the selected space, refreshes the list, and closes confirmation', async () => {
    const user = userEvent.setup()
    mocks.list.mockResolvedValueOnce([space]).mockResolvedValueOnce([])
    mocks.remove.mockResolvedValueOnce(undefined)
    render(SpacesAdminPanel)
    await user.click(await screen.findByRole('button', { name: /Campo de la Práctica.*Activo/ }))
    await user.click(await screen.findByRole('button', { name: 'Borrar espacio' }))
    await user.click(within(await screen.findByRole('alertdialog', { name: 'Eliminar espacio curricular' })).getByRole('button', { name: 'Eliminar espacio' }))

    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(8))
    expect(await screen.findByText('Espacio curricular eliminado.')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Campo de la Práctica.*Activo/ })).not.toBeInTheDocument()
  })

  it('allows another space component as a materia prerequisite while excluding its own components', async () => {
    const user = userEvent.setup()
    mocks.list.mockResolvedValue([{ ...space, id: 9, nombre: 'Espacio previo', carreraId: 9, materias: [{ id: 29, nombre: 'Materia 29' }] }])
    mocks.getPaginated.mockImplementation(async (path: string) => path.startsWith('/carreras')
      ? { data: [{ id: 9, nombre: 'Profesorado' }] }
      : { data: [
        { id: 19, nombre: 'Componente A', carreraId: 9, activo: true },
        { id: 20, nombre: 'Componente B', carreraId: 9, activo: true },
        { id: 29, nombre: 'Materia 29', carreraId: 9, activo: true },
      ] })
    render(SpacesAdminPanel)
    await user.click(await screen.findByRole('button', { name: 'Nuevo espacio curricular' }))
    await user.type(screen.getByLabelText('Nombre'), 'Nuevo espacio')
    await user.selectOptions(screen.getByLabelText('Carrera'), '9')
    await user.click(await screen.findByRole('checkbox', { name: 'Materia: Componente A' }))
    await user.click(screen.getByRole('checkbox', { name: 'Materia: Componente B' }))
    await user.click(screen.getByRole('checkbox', { name: 'Tiene correlativas' }))
    const prerequisite = await screen.findByLabelText('Correlativa')
    expect(prerequisite.querySelector('option[value="materia:19"]')).toBeNull()
    expect(prerequisite.querySelector('option[value="materia:20"]')).toBeNull()
    expect(prerequisite.querySelector('option[value="materia:29"]')).toHaveTextContent('Materia 29')
    await user.selectOptions(prerequisite, 'materia:29')
    await user.click(screen.getByRole('button', { name: /^Agregar$/ }))
    await user.click(screen.getByRole('button', { name: 'Guardar espacio' }))
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      componentesIds: [19, 20],
      correlatividades: [{ materiaRequeridaId: 29, aplicaCursado: false, aplicaRendir: true }],
    })))
  })

  it('requires explicit review before submitting when selected components have active prerequisites', async () => {
    const user = userEvent.setup()
    mocks.list.mockResolvedValue([])
    mocks.getMateria.mockImplementation(async (path: string) => ({
      nombre: path.endsWith('/10') ? 'Práctica I' : 'Práctica II',
      correlatividadesOrigen: path.endsWith('/10')
        ? [{ suspendidaPorEspacio: false, materiaRequerida: { nombre: 'Pedagogía' } }]
        : [],
    }))
    render(SpacesAdminPanel)
    await user.click(await screen.findByRole('button', { name: 'Nuevo espacio curricular' }))
    await user.type(screen.getByLabelText('Nombre'), 'Espacio Integrador')
    await user.selectOptions(screen.getByLabelText('Carrera'), '3')
    await user.click(await screen.findByRole('checkbox', { name: 'Materia: Práctica I' }))
    await user.click(screen.getByRole('checkbox', { name: 'Materia: Práctica II' }))
    expect(await screen.findByText('Práctica I → Pedagogía')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Guardar espacio' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Confirmá la revisión')
    expect(mocks.create).not.toHaveBeenCalled()
    await user.click(screen.getByRole('checkbox', { name: 'Revisé estas reglas y confirmo el cambio de composición' }))
    await user.click(screen.getByRole('button', { name: 'Guardar espacio' }))
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ revisarCorrelatividadesComponentes: true })))
  })
})
