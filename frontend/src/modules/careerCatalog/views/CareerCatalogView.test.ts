import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import type { Component } from 'vue'
import type { PaginatedResult } from '@/core/api/contracts'
import type { CareerStudyPlan, CatalogCareer, StudyPlanSubject } from '../types/careerCatalog'

const mocks = vi.hoisted(() => ({
  listCareerCatalog: vi.fn(),
  getCareerStudyPlan: vi.fn(),
}))

vi.mock('../api/careerCatalogApi', () => ({
  listCareerCatalog: mocks.listCareerCatalog,
  getCareerStudyPlan: mocks.getCareerStudyPlan,
}))

import CareerCatalogView from './CareerCatalogView.vue'

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete
    reject = fail
  })

  return { promise, resolve, reject }
}

function career(id: number, nombre: string, duracionAnios = 4): CatalogCareer {
  return { id, nombre, duracionAnios, activo: true }
}

function subject(id: number, nombre: string, anio: number | null, cargaHoraria = 96): StudyPlanSubject {
  return {
    id,
    nombre,
    cargaHoraria,
    tipoEspacio: 'MATERIA',
    modalidad: 'PRESENCIAL',
    periodo: 'ANUAL',
    regimen: 'REGULAR',
    curso: anio === null ? null : { id: id + 100, anio },
  }
}

function plan(selected: CatalogCareer, materias: StudyPlanSubject[] = [subject(11, 'Lengua I', 1)]): CareerStudyPlan {
  return { ...selected, materias }
}

function paginated(
  data: CatalogCareer[],
  pagination: Partial<PaginatedResult<CatalogCareer>['pagination']> = {},
): PaginatedResult<CatalogCareer> {
  return {
    data,
    pagination: {
      page: 1,
      limit: 20,
      total: data.length,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
      ...pagination,
    },
  }
}

function renderView() {
  return render(CareerCatalogView as Component)
}

beforeEach(() => {
  mocks.listCareerCatalog.mockReset()
  mocks.getCareerStudyPlan.mockReset()
})

describe('CareerCatalogView', () => {
  it('announces catalog and plan loading while each request is pending', async () => {
    const lengua = career(1, 'Profesorado de Lengua')
    const pendingCatalog = deferred<PaginatedResult<CatalogCareer>>()
    const pendingPlan = deferred<CareerStudyPlan>()
    mocks.listCareerCatalog.mockImplementationOnce(() => pendingCatalog.promise)

    renderView()

    expect(await screen.findByRole('status')).toHaveTextContent('Cargando carreras…')
    pendingCatalog.resolve(paginated([lengua]))
    mocks.getCareerStudyPlan.mockImplementationOnce(() => pendingPlan.promise)
    expect(await screen.findByText('Cargando plan de estudio…')).toHaveAttribute('role', 'status')
    pendingPlan.resolve(plan(lengua))
    expect(await screen.findByText('Lengua I')).toBeVisible()
  })

  it('loads the catalog and the first selected career plan on mount', async () => {
    const lengua = career(1, 'Profesorado de Lengua')
    mocks.listCareerCatalog.mockResolvedValue(paginated([lengua]))
    mocks.getCareerStudyPlan.mockResolvedValue(plan(lengua))

    renderView()

    expect(await screen.findByRole('heading', { name: 'Carreras y planes de estudio' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Catálogo de carreras' })).toBeVisible()
    expect(await screen.findByRole('button', { name: /Profesorado de Lengua/i })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByText('Lengua I')).toBeVisible()
    expect(mocks.listCareerCatalog).toHaveBeenCalledWith({ page: 1, limit: 20, search: '' })
    expect(mocks.getCareerStudyPlan).toHaveBeenCalledWith(1)
  })

  it('trims a search, resets to page one, and reloads the catalog', async () => {
    const lengua = career(1, 'Profesorado de Lengua')
    mocks.listCareerCatalog.mockResolvedValue(paginated([lengua]))
    mocks.getCareerStudyPlan.mockResolvedValue(plan(lengua))
    const user = userEvent.setup()

    renderView()
    await screen.findByText('Lengua I')
    const input = screen.getByLabelText('Buscar carrera')
    await user.clear(input)
    await user.type(input, '  Lengua  ')
    await user.click(screen.getByRole('button', { name: 'Buscar' }))

    await waitFor(() => expect(mocks.listCareerCatalog).toHaveBeenLastCalledWith({ page: 1, limit: 20, search: 'Lengua' }))
  })

  it('changes pages with the active search and disables pagination boundaries', async () => {
    const lengua = career(1, 'Profesorado de Lengua')
    const historia = career(2, 'Profesorado de Historia')
    mocks.listCareerCatalog
      .mockResolvedValueOnce(paginated([lengua], { total: 21, totalPages: 2, hasNextPage: true }))
      .mockResolvedValueOnce(paginated([historia], { page: 2, total: 21, totalPages: 2, hasPreviousPage: true }))
    mocks.getCareerStudyPlan.mockResolvedValueOnce(plan(lengua)).mockResolvedValueOnce(plan(historia))
    const user = userEvent.setup()

    renderView()
    expect(await screen.findByText('Página 1 de 2')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))

    expect(await screen.findByText('Página 2 de 2')).toBeVisible()
    expect(mocks.listCareerCatalog).toHaveBeenLastCalledWith({ page: 2, limit: 20, search: '' })
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()
  })

  it('shows catalog empty, error, and retry states without retaining careers', async () => {
    mocks.listCareerCatalog.mockResolvedValueOnce(paginated([])).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(paginated([]))
    const user = userEvent.setup()

    const empty = renderView()
    await waitFor(() => expect(screen.getByText('No hay carreras activas para mostrar.')).toBeVisible())
    expect(mocks.getCareerStudyPlan).not.toHaveBeenCalled()
    empty.unmount()

    renderView()
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar el catálogo de carreras.')
    await user.click(screen.getByRole('button', { name: 'Reintentar catálogo' }))
    await waitFor(() => expect(screen.getByText('No hay carreras activas para mostrar.')).toBeVisible())
    expect(mocks.listCareerCatalog).toHaveBeenLastCalledWith({ page: 1, limit: 20, search: '' })
  })

  it('groups plan subjects by ascending year and leaves subjects without a course last', async () => {
    const lengua = career(1, 'Profesorado de Lengua')
    mocks.listCareerCatalog.mockResolvedValue(paginated([lengua]))
    mocks.getCareerStudyPlan.mockResolvedValue(plan(lengua, [
      subject(31, 'Didáctica II', 2),
      subject(32, 'Lengua I', 1),
      subject(33, 'Taller sin curso', null, 64),
    ]))

    renderView()

    expect(await screen.findByText('Taller sin curso')).toBeVisible()
    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      '1.º año',
      '2.º año',
      'Sin año asignado',
    ])
    expect(screen.getAllByText('96 h')).toHaveLength(2)
    expect(screen.getAllByText('MATERIA')).toHaveLength(3)
  })

  it('shows an empty plan, then retries a failed plan without stale subjects', async () => {
    const lengua = career(1, 'Profesorado de Lengua')
    mocks.listCareerCatalog.mockResolvedValue(paginated([lengua]))
    mocks.getCareerStudyPlan.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(plan(lengua, []))
    const user = userEvent.setup()

    renderView()

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar el plan de estudio.')
    expect(screen.queryByText('Lengua I')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reintentar plan' }))
    expect(await screen.findByText('No hay materias cargadas en este plan.')).toBeVisible()
    expect(mocks.getCareerStudyPlan).toHaveBeenCalledTimes(2)
  })

  it('keeps the latest selected plan when an earlier selection resolves later', async () => {
    const lengua = career(1, 'Profesorado de Lengua')
    const historia = career(2, 'Profesorado de Historia')
    const firstPlan = deferred<CareerStudyPlan>()
    const secondPlan = deferred<CareerStudyPlan>()
    mocks.listCareerCatalog.mockResolvedValue(paginated([lengua, historia]))
    mocks.getCareerStudyPlan.mockImplementationOnce(() => firstPlan.promise).mockImplementationOnce(() => secondPlan.promise)
    const user = userEvent.setup()

    renderView()
    await screen.findByRole('button', { name: /Profesorado de Historia/i })
    await user.click(screen.getByRole('button', { name: /Profesorado de Historia/i }))
    secondPlan.resolve(plan(historia, [subject(21, 'Historia II', 2)]))
    expect(await screen.findByText('Historia II')).toBeVisible()

    firstPlan.resolve(plan(lengua, [subject(11, 'Lengua I', 1)]))
    await waitFor(() => expect(screen.getByText('Historia II')).toBeVisible())
    expect(screen.queryByText('Lengua I')).not.toBeInTheDocument()
  })

  it('ignores an earlier catalog response after a newer search finishes', async () => {
    const lengua = career(1, 'Profesorado de Lengua')
    const historia = career(2, 'Profesorado de Historia')
    const earlierCatalog = deferred<PaginatedResult<CatalogCareer>>()
    mocks.listCareerCatalog.mockImplementationOnce(() => earlierCatalog.promise).mockResolvedValueOnce(paginated([historia]))
    mocks.getCareerStudyPlan.mockResolvedValue(plan(historia, [subject(21, 'Historia II', 2)]))
    const user = userEvent.setup()

    renderView()
    const input = await screen.findByLabelText('Buscar carrera')
    await user.type(input, 'Historia')
    await user.click(screen.getByRole('button', { name: 'Buscar' }))
    expect(await screen.findByText('Historia II')).toBeVisible()

    earlierCatalog.resolve(paginated([lengua]))
    await waitFor(() => expect(screen.getByRole('button', { name: /Profesorado de Historia/i })).toHaveAttribute('aria-pressed', 'true'))
    expect(screen.queryByRole('button', { name: /Profesorado de Lengua/i })).not.toBeInTheDocument()
  })

  it('offers only keyboard-operable read-only career selection actions', async () => {
    const lengua = career(1, 'Profesorado de Lengua')
    const historia = career(2, 'Profesorado de Historia')
    mocks.listCareerCatalog.mockResolvedValue(paginated([lengua, historia]))
    mocks.getCareerStudyPlan.mockResolvedValueOnce(plan(lengua)).mockResolvedValueOnce(plan(historia))
    const user = userEvent.setup()

    renderView()
    const historiaButton = await screen.findByRole('button', { name: /Profesorado de Historia/i })
    historiaButton.focus()
    await user.keyboard('{Enter}')

    await waitFor(() => expect(historiaButton).toHaveAttribute('aria-pressed', 'true'))
    expect(mocks.getCareerStudyPlan).toHaveBeenLastCalledWith(2)
    for (const forbiddenLabel of ['Editar', 'Desactivar', 'Agregar materia', 'Inscribirme']) {
      expect(document.body).not.toHaveTextContent(forbiddenLabel)
    }
  })
})
