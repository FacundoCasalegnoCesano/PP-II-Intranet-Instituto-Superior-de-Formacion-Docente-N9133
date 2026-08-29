import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/vue'
import HomeView from './HomeView.vue'
import { fetchStudentCareers } from '../api/homeApi'

const state = vi.hoisted(() => ({ activeRole: 'ALUMNO', user: { idUsuario: 13, apellidoNombre: 'Lucía Test' } }))
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => state }))
vi.mock('../api/homeApi', () => ({
  fetchStudentCareers: vi.fn().mockResolvedValue([{ id: 7, carreraId: 3, carrera: { id: 3, nombre: 'Profesorado', materias: [{ id: 1 }, { id: 2 }] } }]),
  fetchStudentTrajectory: vi.fn().mockResolvedValue({ cantidadMateriasAprobadas: 1, promedioGeneral: 8, materias: [{}, {}] }),
  progressFromTrajectory: vi.fn().mockReturnValue({ approved: 1, total: 2, percent: 50 }),
}))

describe('HomeView', () => {
  beforeEach(() => { state.activeRole = 'ALUMNO' })

  it('shows real student career progress and average', async () => {
    render(HomeView)
    expect(await screen.findByText('1 de 2 materias aprobadas')).toBeVisible()
    expect(screen.getByText('Promedio general: 8')).toBeVisible()
    expect(screen.getByLabelText('Carrera')).toBeVisible()
  })

  it('selects the first active career when the account has an inactive enrollment', async () => {
    vi.mocked(fetchStudentCareers).mockResolvedValueOnce([
      { id: 4, carreraId: 2, carrera: { id: 2, nombre: 'Carrera inactiva', activo: false, materias: [] } },
      { id: 3, carreraId: 3, carrera: { id: 3, nombre: 'Carrera activa', activo: true, materias: [{ id: 1 }] } },
    ])

    render(HomeView)

    expect(await screen.findByRole('option', { name: 'Carrera activa', selected: true })).toBeVisible()
  })

  it.each(['PROFESOR', 'ADMINISTRATIVO'])('shows only upcoming launchers for %s', async (role) => {
    state.activeRole = role
    render(HomeView)
    expect((await screen.findAllByText('Próximamente')).length).toBeGreaterThan(0)
    expect(screen.queryByLabelText('Carrera')).not.toBeInTheDocument()
  })
})
