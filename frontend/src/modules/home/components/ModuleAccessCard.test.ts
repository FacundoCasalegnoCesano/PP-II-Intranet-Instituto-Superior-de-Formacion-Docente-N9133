import { defineComponent, h } from 'vue'
import { render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import { CalendarDays } from 'lucide-vue-next'
import ModuleAccessCard from './ModuleAccessCard.vue'

const RouterLink = defineComponent({
  props: { to: { type: Object, required: true } },
  setup(props, { slots }) {
    return () => h('a', { 'data-route-name': (props.to as { name?: string }).name }, slots.default?.())
  },
})

describe('ModuleAccessCard', () => {
  it('renders a navigable card when it has a destination', () => {
    render(ModuleAccessCard, {
      props: {
        label: 'Horarios',
        description: 'Consultá el horario institucional publicado.',
        icon: CalendarDays,
        to: { name: 'schedules' },
      },
      global: { stubs: { RouterLink } },
    })

    expect(screen.getByRole('link', { name: /Horarios/ })).toHaveAttribute('data-route-name', 'schedules')
    expect(screen.getByText('Consultá el horario institucional publicado.')).toBeVisible()
    expect(screen.getByRole('img', { hidden: true })).toBeInTheDocument()
  })

  it('renders a non-interactive article with status when it has no destination', () => {
    render(ModuleAccessCard, {
      props: {
        label: 'Cursadas',
        description: 'La gestión docente de cursadas todavía no está disponible.',
        icon: CalendarDays,
        status: 'Próximamente',
      },
      global: { stubs: { RouterLink } },
    })

    expect(screen.getByRole('article')).toHaveTextContent('Cursadas')
    expect(screen.getByText('Próximamente')).toBeVisible()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
