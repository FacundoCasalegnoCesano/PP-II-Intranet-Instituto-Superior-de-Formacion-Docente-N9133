import { render, screen } from '@testing-library/vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'
import App from './App.vue'

const BaseRoute = {
  template: '<p>Ruta base</p>',
}

describe('App', () => {
  it('renders the active route through RouterView', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: BaseRoute }],
    })

    router.push('/')
    await router.isReady()

    render(App, {
      global: {
        plugins: [router],
      },
    })

    expect(screen.getByText('Ruta base')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Mensajes del sistema' })).toBeInTheDocument()
  })
})
