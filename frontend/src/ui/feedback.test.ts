import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { nextTick } from 'vue'
import AppToast from './AppToast.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import { useFeedback } from './feedback'

describe('feedback UI', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useFeedback().clear()
  })

  it('announces a contextual toast and lets the user close it', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(AppToast)

    useFeedback().success('Los cambios se guardaron')

    const message = await screen.findByText('Los cambios se guardaron')
    expect(message.closest('[role="status"]')).toHaveAttribute('aria-live', 'polite')
    await user.click(screen.getByRole('button', { name: 'Cerrar mensaje' }))
    expect(screen.queryByText('Los cambios se guardaron')).not.toBeInTheDocument()
  })

  it('cancels a risky action with Escape', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(ConfirmDialog, {
      props: {
        open: true,
        title: 'Cerrar sesión',
        description: 'Tendrás que ingresar nuevamente.',
        confirmLabel: 'Cerrar sesión',
        onCancel,
      },
    })

    await user.keyboard('{Escape}')

    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('associates the dialog description and focuses cancellation on initial open', async () => {
    render(ConfirmDialog, {
      props: { open: true, title: 'Eliminar registro', description: 'Esta acción no se puede deshacer.' },
    })

    await nextTick()
    await nextTick()

    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveAttribute('aria-describedby', 'confirm-description')
    expect(dialog).toHaveAttribute('aria-labelledby', 'confirm-title')
    expect(within(dialog).getAllByRole('button', { name: 'Cancelar' })[1]).toHaveFocus()
  })
})
