import { render, screen } from '@testing-library/vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { RouterView } from 'vue-router'
import AdminCoursesView from './AdminCoursesView.vue'

const mocks = vi.hoisted(() => ({
  listSubjects: vi.fn(),
  listUsers: vi.fn(),
  getCourse: vi.fn(),
}))

vi.mock('../api/adminApi', () => ({
  adminApi: {
    listSubjects: mocks.listSubjects,
    listUsers: mocks.listUsers,
    getCourse: mocks.getCourse,
  },
}))

describe('AdminCoursesView', () => {
  it('directs staff to the official published schedule without exposing the legacy schedule editor', async () => {
    mocks.listSubjects.mockResolvedValue({ data: [] })
    mocks.listUsers.mockResolvedValue({ data: [] })
    mocks.getCourse.mockResolvedValue({
      id: 12,
      materia: { id: 4, nombre: 'Álgebra', cargaHoraria: 96, tipoEspacio: 'ASIGNATURA', activo: true },
      anioLectivo: 2026,
      periodo: 'ANUAL',
      horarios: [{ id: 3, cursadaId: 12, dia: 'LUNES', horaInicio: '1970-01-01T08:00:00.000Z', horaFin: '1970-01-01T10:00:00.000Z', activo: true }],
      activo: true,
    })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/app/administracion/cursadas/:id', name: 'admin-course-detail', component: AdminCoursesView },
        { path: '/app/administracion/cursadas/:id/editar', name: 'admin-course-edit', component: AdminCoursesView },
        { path: '/app/horarios', name: 'schedules', component: AdminCoursesView },
      ],
    })
    await router.push('/app/administracion/cursadas/12')
    await router.isReady()

    render(defineComponent({ render: () => h(RouterView) }), { global: { plugins: [router] } })

    expect(await screen.findByRole('link', { name: 'Horarios oficiales' })).toHaveAttribute('href', '/app/horarios')
    expect(screen.queryByRole('button', { name: 'Agregar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Quitar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar horario' })).not.toBeInTheDocument()
    expect(screen.queryByText('LUNES · 08:00–10:00')).not.toBeInTheDocument()
  })
})
