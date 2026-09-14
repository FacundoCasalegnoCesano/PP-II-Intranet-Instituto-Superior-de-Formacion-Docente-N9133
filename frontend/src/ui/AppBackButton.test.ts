import { render, screen } from '@testing-library/vue'
import { describe, expect, it, vi } from 'vitest'
import AppBackButton from './AppBackButton.vue'

const route = vi.hoisted(() => ({ name: 'admin-exam-detail', params: { id: '9' }, query: { estadoMesa: 'EN_PROCESO' }, fullPath: '/app/administracion/mesas/9?estadoMesa=EN_PROCESO' }))
const router = vi.hoisted(() => ({ options: { history: { state: { back: null } } }, replace: vi.fn(), resolve: vi.fn(), back: vi.fn() }))
const auth = vi.hoisted(() => ({ activeRole: 'ADMINISTRATIVO' }))

vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => router }))
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => auth }))

describe('AppBackButton', () => {
  it('falls back from an exam detail to the exam list while retaining filters', async () => {
    render(AppBackButton)

    await screen.getByRole('button', { name: /Volver/ }).click()

    expect(router.replace).toHaveBeenCalledWith({ name: 'admin-exams', query: { estadoMesa: 'EN_PROCESO' } })
  })
})
