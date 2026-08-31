import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/vue'
import AcademicRecordView from './AcademicRecordView.vue'

const state = vi.hoisted(() => ({ user: { idUsuario: 13 }, activeRole: 'ALUMNO' }))
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => state }))
vi.mock('../api/academicRecordApi', () => ({
  fetchAcademicRecordCareers: vi.fn().mockResolvedValue([{ id: 1, carreraId: 3, activo: true, carrera: { id: 3, nombre: 'Profesorado', materias: [] } }]),
  fetchAcademicRecordTrajectory: vi.fn().mockResolvedValue({
    alumnoUsuarioId: 13, carrera: { id: 3, nombre: 'Profesorado' }, promedioGeneral: 8.5, cantidadMateriasAprobadas: 1,
    materias: [{ materia: { id: 5, nombre: 'PedagogÃ­a' }, estado: 'REGULAR', plan: { anio: 1 }, asistencia: { porcentaje: 80 }, regularidad: { hasta: '2027-12-31T00:00:00.000Z', vencida: false }, definitiva: null }],
  }),
}))

describe('AcademicRecordView', () => {
  it('renders the integral backend trajectory for the selected career', async () => {
    render(AcademicRecordView)
    expect(await screen.findByRole('heading', { name: 'Mi trayectoria acadÃ©mica' })).toBeVisible()
    await screen.findByText('PedagogÃ­a')
    expect(screen.getByLabelText('Carrera')).toHaveValue('3')
    expect(screen.getByText('PedagogÃ­a')).toBeVisible()
    expect(screen.getByText('REGULAR')).toBeVisible()
    expect(screen.getByText('Asistencia: 80%')).toBeVisible()
    expect(screen.getByText('Promedio general: 8.5')).toBeVisible()
  })
})
