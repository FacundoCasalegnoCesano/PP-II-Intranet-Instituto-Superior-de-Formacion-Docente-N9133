import { render, screen } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocationQuery } from 'vue-router'
import AppBackButton from './AppBackButton.vue'

const route = vi.hoisted(() => ({ name: 'admin-exam-detail' as string, params: { id: '9' } as Record<string, string>, query: { estadoMesa: 'EN_PROCESO' } as LocationQuery, fullPath: '/app/administracion/mesas/9?estadoMesa=EN_PROCESO' }))
const router = vi.hoisted(() => ({ options: { history: { state: { back: null } } }, replace: vi.fn(), resolve: vi.fn(), back: vi.fn() }))
const auth = vi.hoisted(() => ({ activeRole: 'ADMINISTRATIVO' }))

vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => router }))
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => auth }))

describe('AppBackButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    route.name = 'admin-exam-detail'
    route.query = { estadoMesa: 'EN_PROCESO' }
    route.fullPath = '/app/administracion/mesas/9?estadoMesa=EN_PROCESO'
  })

  it('falls back from an exam detail to the exam list while retaining filters', async () => {
    render(AppBackButton)

    await screen.getByRole('button', { name: /Volver/ }).click()

    expect(router.replace).toHaveBeenCalledWith({ name: 'admin-exams', query: { estadoMesa: 'EN_PROCESO' } })
  })

  it.each(['admin-homologation-create', 'admin-homologation-detail'])('retorna desde %s al listado con filtros internos normalizados', async (name) => {
    route.name = name
    route.query = { returnTo: '/app/administracion/homologaciones?search=%20Luc%C3%ADa%20&estado=PENDIENTE&tipo=PARCIAL&carreraId=3&materiaId=14&page=2&sort=createdAt' }
    route.fullPath = `/app/administracion/homologaciones${name.endsWith('detail') ? '/7' : '/nueva'}?returnTo=...`
    router.replace.mockClear()
    render(AppBackButton)

    await screen.getByRole('button', { name: /Volver/ }).click()

    expect(router.replace).toHaveBeenCalledWith({
      name: 'admin-homologations',
      query: { search: 'Lucía', estado: 'PENDIENTE', tipo: 'PARCIAL', carreraId: '3', materiaId: '14', page: '2' },
    })
  })

  it('descarta el returnTo externo y vuelve al listado limpio', async () => {
    route.name = 'admin-homologation-detail'
    route.query = { returnTo: 'https://evil.example/steal' }
    router.replace.mockClear()
    render(AppBackButton)

    await screen.getByRole('button', { name: /Volver/ }).click()

    expect(router.replace).toHaveBeenCalledWith({ name: 'admin-homologations' })
  })

  it.each([
    { caso: 'valor null', valor: null, conservaPagina: false },
    { caso: 'valor ausente', valor: undefined, conservaPagina: false },
    { caso: 'arreglo vacío', valor: [], conservaPagina: false },
    { caso: 'primer elemento null', valor: [null, '/app/administracion/homologaciones?page=2'], conservaPagina: false },
    { caso: 'primer elemento string', valor: ['/app/administracion/homologaciones?page=2', null], conservaPagina: true },
  ])('normaliza query nullable sin inventar destinos: $caso', async ({ valor, conservaPagina }) => {
    route.name = 'admin-homologation-detail'
    route.query = valor === undefined ? {} : { returnTo: valor }
    render(AppBackButton)

    await screen.getByRole('button', { name: /Volver/ }).click()

    expect(router.replace).toHaveBeenCalledWith({
      name: 'admin-homologations',
      ...(conservaPagina ? { query: { page: '2' } } : {}),
    })
  })
})
