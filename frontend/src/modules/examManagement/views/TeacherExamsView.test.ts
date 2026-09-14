import { render, screen } from '@testing-library/vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import TeacherExamsView from './TeacherExamsView.vue'

const api = vi.hoisted(() => ({ listExamTables: vi.fn(), getExamWorkspace: vi.fn(), reloadExamResults: vi.fn(), saveExamResult: vi.fn(), closeExamTable: vi.fn() }))
const auth = vi.hoisted(() => ({ user: { idUsuario: 21 }, activeRole: 'PROFESOR' }))

vi.mock('../api/examsApi', () => api)
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => auth }))

const workspace = {
  detail: {
    id: 9, materia: { id: 5, nombre: 'Pedagogía', notaMinima: 6, carrera: { id: 2, nombre: 'Profesorado' } }, fecha: '2026-12-10T12:00:00.000Z', tipoExamen: 'ORAL', llamado: 2, estadoMesa: 'EN_PROCESO', version: 4, tribunales: [{ id: 1, profesorId: 20, apellidoNombre: 'Ana Presidenta', rolTribunal: 'PRESIDENTE' }, { id: 2, profesorId: 21, apellidoNombre: 'Luis Vocal', rolTribunal: 'VOCAL' }], _count: { inscripciones: 1 },
  },
  results: [{ id: 21, alumno: { idUsuario: 13, apellidoNombre: 'Lucía Fernández' }, condicion: 'REGULAR', resultado: 'PENDIENTE', nota: null, aprobado: null, notaMinima: 6, ausente: false }],
}

describe('TeacherExamsView', () => {
  it('keeps result loading available to an assigned vocal without exposing close', async () => {
    api.getExamWorkspace.mockResolvedValue(workspace)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/app/docente/mesas/:id', name: 'teacher-exam-detail', component: TeacherExamsView }, { path: '/app/docente/mesas', name: 'teacher-exams', component: TeacherExamsView }],
    })
    await router.push('/app/docente/mesas/9')
    await router.isReady()
    render(defineComponent({ render: () => h(RouterView) }), { global: { plugins: [router] } })

    expect(await screen.findByText('Resultados de la mesa')).toBeVisible()
    expect(screen.getByLabelText('Nota de Lucía Fernández')).toBeVisible()
    expect(screen.queryByRole('button', { name: /Cerrar y publicar mesa/i })).toBeNull()
  })

  it('explains that a 404 mesa is not assigned to the docente', async () => {
    api.getExamWorkspace.mockRejectedValue({ status: 404 })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/app/docente/mesas', name: 'teacher-exams', component: TeacherExamsView },
        { path: '/app/docente/mesas/:id', name: 'teacher-exam-detail', component: TeacherExamsView },
      ],
    })
    await router.push('/app/docente/mesas/9')
    await router.isReady()
    render(defineComponent({ render: () => h(RouterView) }), { global: { plugins: [router] } })

    expect(await screen.findByText('Esta mesa no está asignada a tu tribunal.')).toBeVisible()
  })

  it('shows the specific permission message when the mesa listing returns 403', async () => {
    api.listExamTables.mockRejectedValue({ status: 403 })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/app/docente/mesas', name: 'teacher-exams', component: TeacherExamsView }],
    })
    await router.push('/app/docente/mesas')
    await router.isReady()
    render(defineComponent({ render: () => h(RouterView) }), { global: { plugins: [router] } })

    expect(await screen.findByText('No tenés permiso para consultar estas mesas.')).toBeVisible()
  })
})
