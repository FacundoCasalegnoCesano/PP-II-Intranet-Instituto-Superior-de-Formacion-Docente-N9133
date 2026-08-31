import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import ExamsView from './ExamsView.vue'

const state = vi.hoisted(() => ({ user: { idUsuario: 13 }, activeRole: 'ALUMNO' }))
const api = vi.hoisted(() => ({ available: vi.fn(), mine: vi.fn(), enroll: vi.fn(), withdraw: vi.fn() }))
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => state }))
vi.mock('../api/examsApi', () => ({
  fetchAvailableExams: api.available, fetchMyExamEnrollments: api.mine, enrollInExam: api.enroll, withdrawFromExam: api.withdraw,
}))

describe('ExamsView', () => {
  it('shows backend-calculated exam condition, tribunal and enrolls without a student id', async () => {
    api.available.mockResolvedValue([{ id: 9, materia: { id: 5, nombre: 'PedagogÃ­a', carrera: { id: 3, nombre: 'Profesorado' } }, fecha: '2026-12-10T12:00:00.000Z', tipoExamen: 'ORAL', llamado: 2, tribunal: [{ profesorId: 1, apellidoNombre: 'Ana Profesor', rolTribunal: 'PRESIDENTE' }], condicion: 'LIBRE', inscripto: false }])
    api.mine.mockResolvedValue([])
    api.enroll.mockResolvedValue({ id: 7 })
    const user = userEvent.setup()
    render(ExamsView)

    expect(await screen.findByText('PedagogÃ­a')).toBeVisible()
    expect(screen.getByText('CondiciÃ³n: LIBRE')).toBeVisible()
    expect(screen.getByText(/Ana Profesor/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Inscribirme' }))
    expect(api.enroll).toHaveBeenCalledWith(9, 'LIBRE')
  })
})
