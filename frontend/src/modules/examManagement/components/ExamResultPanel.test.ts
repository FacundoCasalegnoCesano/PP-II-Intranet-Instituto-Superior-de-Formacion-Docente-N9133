import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ExamResultPanel from './ExamResultPanel.vue'
import type { InscriptoResultado } from '../types/exams'

const pending: InscriptoResultado = {
  id: 21,
  alumno: { idUsuario: 13, apellidoNombre: 'Lucía Fernández', email: 'lucia@example.test', dni: '42666888' },
  condicion: 'REGULAR',
  resultado: 'PENDIENTE',
  nota: null,
  aprobado: null,
  notaMinima: 6,
  ausente: false,
}

function renderPanel(overrides: Record<string, unknown> = {}) {
  return render(ExamResultPanel, {
    props: {
      results: [pending],
      version: 7,
      status: 'EN_PROCESO',
      saveResult: vi.fn().mockResolvedValue({ version: 8 }),
      reloadResults: vi.fn().mockResolvedValue({ results: [pending], version: 7 }),
      ...overrides,
    },
  })
}

describe('ExamResultPanel', () => {
  it('keeps zero as a grade and shows the backend result state', async () => {
    const saveResult = vi.fn().mockResolvedValue({ version: 8 })
    const user = userEvent.setup()
    renderPanel({ saveResult })

    expect(screen.getByText('Pendiente')).toBeVisible()
    await user.type(screen.getByLabelText('Nota de Lucía Fernández'), '0')
    await user.click(screen.getByRole('button', { name: 'Guardar resultado de Lucía Fernández' }))

    expect(saveResult).toHaveBeenCalledWith({ alumnoId: 13, nota: 0, expectedVersion: 7 })
  })

  it('sends absence independently from a missing note', async () => {
    const saveResult = vi.fn().mockResolvedValue({ version: 8 })
    const user = userEvent.setup()
    renderPanel({ saveResult })

    await user.click(screen.getByLabelText('Ausente: Lucía Fernández'))
    await user.click(screen.getByRole('button', { name: 'Guardar resultado de Lucía Fernández' }))

    expect(saveResult).toHaveBeenCalledWith({ alumnoId: 13, ausente: true, expectedVersion: 7 })
  })

  it('reloads after a stale version without losing the unsaved draft', async () => {
    const saveResult = vi.fn().mockRejectedValue({ status: 409, message: 'Versión obsoleta' })
    const reloadResults = vi.fn().mockResolvedValue({ results: [pending], version: 8 })
    const user = userEvent.setup()
    renderPanel({ saveResult, reloadResults })

    const input = screen.getByLabelText('Nota de Lucía Fernández')
    await user.type(input, '8')
    await user.click(screen.getByRole('button', { name: 'Guardar resultado de Lucía Fernández' }))

    expect(await screen.findByText(/otra persona modificó la mesa/i)).toBeVisible()
    expect(reloadResults).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('Nota de Lucía Fernández')).toHaveValue(8)
  })

  it('closes only when every active inscription has a result', async () => {
    const closeTable = vi.fn().mockResolvedValue({ version: 8 })
    const user = userEvent.setup()
    renderPanel({
      results: [{ ...pending, resultado: 'CALIFICADO', nota: 8, aprobado: true }],
      closeTable,
      canClose: true,
    })

    await user.click(screen.getByRole('button', { name: 'Cerrar y publicar mesa' }))

    expect(screen.getByRole('dialog', { name: 'Confirmar cierre y publicación' })).toBeVisible()
    expect(screen.getByText('Calificados')).toBeVisible()
    expect(screen.getByText('Ausentes')).toBeVisible()
    expect(screen.getByText('Pendientes')).toBeVisible()
    expect(closeTable).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Cancelar cierre' }))
    expect(screen.queryByRole('dialog', { name: 'Confirmar cierre y publicación' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Cerrar y publicar mesa' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar cierre y publicación' }))

    expect(closeTable).toHaveBeenCalledWith(7)
  })

  it('does not offer confirmation while active inscriptions remain pending', async () => {
    const user = userEvent.setup()
    renderPanel({ results: [pending], closeTable: vi.fn(), canClose: true })

    const closeButton = screen.getByRole('button', { name: 'Cerrar y publicar mesa' })
    expect(closeButton).toBeDisabled()
    expect(screen.queryByRole('dialog', { name: 'Confirmar cierre y publicación' })).toBeNull()
  })

  it('requires a reason when an administrator reopens a published table', async () => {
    const reopenTable = vi.fn().mockResolvedValue({ version: 9 })
    const user = userEvent.setup()
    renderPanel({ status: 'FINALIZADA', canReopen: true, reopenTable })

    await user.type(screen.getByLabelText('Motivo de reapertura'), 'Corrección de acta')
    await user.click(screen.getByRole('button', { name: 'Reabrir mesa' }))

    expect(reopenTable).toHaveBeenCalledWith('Corrección de acta', 7)
  })
})
