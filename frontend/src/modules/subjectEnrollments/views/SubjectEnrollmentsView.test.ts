import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import SubjectEnrollmentsView from './SubjectEnrollmentsView.vue'

const state = vi.hoisted(() => ({ user: { idUsuario: 13 }, activeRole: 'ALUMNO' }))
const api = vi.hoisted(() => ({ available: vi.fn(), mine: vi.fn(), verify: vi.fn(), enroll: vi.fn(), drop: vi.fn() }))
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => state }))
vi.mock('../api/subjectEnrollmentsApi', () => ({
  fetchAvailableSubjects: api.available,
  fetchMySubjectEnrollments: api.mine,
  verifySubjectEnrollment: api.verify,
  enrollInSubject: api.enroll,
  dropSubjectEnrollment: api.drop,
}))

describe('SubjectEnrollmentsView', () => {
  it('verifies a subject before showing enrollment confirmation and links to official schedules', async () => {
    api.available.mockResolvedValue([{ id: 5, nombre: 'Pedagogía', curso: { anio: 1 }, carreras: [{ id: 3, nombre: 'Profesorado' }], modalidad: 'SEMIPRESENCIAL', yaInscripto: false, yaAprobada: false, cumpleCorrelativas: true, correlativasPendientes: [], habilitada: true }])
    api.verify.mockResolvedValue({ puedeInscribirse: true, materia: { id: 5, nombre: 'Pedagogía', modalidad: 'SEMIPRESENCIAL', yaInscripto: false, yaAprobada: false, cumpleCorrelativas: true, correlativasPendientes: [], habilitada: true } })
    api.mine.mockResolvedValue([])
    api.enroll.mockResolvedValue({ id: 8 })
    const user = userEvent.setup()
    render(SubjectEnrollmentsView)

    expect(await screen.findByText('Pedagogía')).toBeVisible()
    expect(screen.getByText('Modalidad: Semipresencial')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Horarios oficiales' })).toHaveAttribute('href', '/app/horarios')
    await user.click(screen.getByRole('button', { name: 'Verificar e inscribirme' }))
    expect(api.verify).toHaveBeenCalledWith(5, expect.any(Number))
    expect(await screen.findByRole('alertdialog', { name: 'Confirmar inscripción' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Inscribirme' }))
    expect(api.enroll).toHaveBeenCalledWith(expect.objectContaining({ materiaId: 5, modalidadElegida: 'SEMIPRESENCIAL' }))
  })
})
