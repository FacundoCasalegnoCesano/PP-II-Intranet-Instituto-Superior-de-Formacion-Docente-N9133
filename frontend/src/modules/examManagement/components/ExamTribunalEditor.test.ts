import { render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import ExamTribunalEditor from './ExamTribunalEditor.vue'

describe('ExamTribunalEditor', () => {
  it('shows an invalid tribunal as incomplete when a role is malformed', () => {
    render(ExamTribunalEditor, {
      props: {
        members: [
          { profesorId: 1, apellidoNombre: 'Ana', rolTribunal: 'PRESIDENTE' },
          { profesorId: 2, apellidoNombre: 'Luis', rolTribunal: 'VOCAL' },
          { profesorId: 3, apellidoNombre: 'Marta', rolTribunal: 'OTRO' as 'VOCAL' },
        ],
        teachers: [],
      },
    })

    expect(screen.getByText('Incompleto')).toBeVisible()
  })
})
