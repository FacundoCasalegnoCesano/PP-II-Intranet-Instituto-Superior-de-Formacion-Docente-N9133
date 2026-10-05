import { defineComponent, h } from 'vue'
import { render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import TeacherStudentsTable from './TeacherStudentsTable.vue'

describe('TeacherStudentsTable', () => {
  it('conserva el año lectivo y limita Calificaciones al alumno en desktop y móvil', () => {
    const RouterLink = defineComponent({
      props: { to: { type: Object, required: true } },
      setup: (props, { slots }) => () => h('a', {
        href: '#',
        'data-to': JSON.stringify(props.to),
      }, slots.default?.()),
    })

    render(TeacherStudentsTable, {
      props: {
        courseId: 12,
        anioLectivo: 2025,
        students: [{ alumnoId: 13, apellidoNombre: 'Ada Lovelace', dni: 123, email: 'ada@example.test' }],
      },
      global: { stubs: { RouterLink } },
    })

    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(6)
    for (const link of links) {
      expect(link).toHaveAttribute('data-to', expect.stringContaining('"anioLectivo":"2025"'))
    }
    expect(screen.getAllByRole('link', { name: 'Calificaciones' })).toHaveLength(2)
    for (const link of screen.getAllByRole('link', { name: 'Calificaciones' })) {
      expect(link).toHaveAttribute('data-to', expect.stringContaining('"alumnoId":"13"'))
    }
  })
})
