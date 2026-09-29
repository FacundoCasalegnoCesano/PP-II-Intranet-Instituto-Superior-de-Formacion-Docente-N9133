import { defineComponent, nextTick, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import ConfirmDialog from './ConfirmDialog.vue'

describe('ConfirmDialog', () => {
  it('starts in the dialog and traps Tab in both directions', async () => {
    const user = userEvent.setup()
    render(ConfirmDialog, {
      props: { open: true, title: 'Eliminar registro', description: 'Esta acción no se puede deshacer.' },
    })

    const dialog = screen.getByRole('alertdialog')
    await nextTick()
    await nextTick()
    const buttons = within(dialog).getAllByRole('button')
    const cancelButton = within(dialog).getAllByRole('button', { name: 'Cancelar' }).at(-1)
    expect(cancelButton).toHaveFocus()

    buttons[0].focus()
    await user.keyboard('{Shift>}{Tab}{/Shift}')
    expect(buttons.at(-1)).toHaveFocus()

    buttons.at(-1)?.focus()
    await user.tab()
    expect(buttons[0]).toHaveFocus()
  })

  it('cancels with Escape and restores focus to the opener', async () => {
    const user = userEvent.setup()
    const Harness = defineComponent({
      components: { ConfirmDialog },
      setup() {
        const open = ref(false)
        return { open }
      },
      template: '<button type="button" @click="open = true">Abrir confirmación</button><ConfirmDialog :open="open" title="Cerrar sesión" description="Tendrás que ingresar nuevamente." @cancel="open = false" />',
    })

    render(Harness)
    const opener = screen.getByRole('button', { name: 'Abrir confirmación' })
    await user.click(opener)
    await user.keyboard('{Escape}')
    await nextTick()

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('announces an action error through the dialog description', () => {
    render(ConfirmDialog, {
      props: {
        open: true,
        title: 'Inscribirse',
        description: 'Se enviará la inscripción.',
        error: 'No pudimos completar la inscripción.',
      },
    })

    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByRole('alert')).toHaveTextContent('No pudimos completar la inscripción.')
    expect(dialog).toHaveAttribute('aria-describedby', 'confirm-description confirm-error')
  })
})
