import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/vue'
import AdminFilters from './AdminFilters.vue'

describe('AdminFilters', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces fast typing, keeps blur searches, applies slot filters, clears, and cleans up', async () => {
    vi.useFakeTimers()
    const submit = vi.fn()
    const updateSearch = vi.fn()
    const searching = vi.fn()
    const { getByLabelText, getByRole, unmount } = render(AdminFilters, {
      props: { search: '', 'onUpdate:search': updateSearch, onSearching: searching, onSubmit: submit },
      slots: { default: '<select aria-label="Estado"><option value="">Todos</option><option value="true">Activos</option></select>' },
    })
    const input = getByLabelText('Buscar')

    await fireEvent.update(input, 'Claudia')
    expect(searching).toHaveBeenCalledTimes(1)
    expect(updateSearch).toHaveBeenCalledWith('Claudia')
    expect(submit).not.toHaveBeenCalled()
    vi.advanceTimersByTime(299)
    expect(submit).not.toHaveBeenCalled()
    await fireEvent.update(input, 'Claudia nueva')
    vi.advanceTimersByTime(299)
    expect(submit).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(submit).toHaveBeenCalledTimes(1)

    await fireEvent.update(input, '')
    await fireEvent.blur(input)
    vi.advanceTimersByTime(300)
    expect(submit).toHaveBeenCalledTimes(2)

    await fireEvent.update(input, 'con filtro')
    await fireEvent.update(getByRole('combobox', { name: 'Estado' }), 'true')
    expect(submit).toHaveBeenCalledTimes(3)
    vi.advanceTimersByTime(300)
    expect(submit).toHaveBeenCalledTimes(3)

    await fireEvent.update(input, 'boton')
    await fireEvent.click(getByRole('button', { name: 'Aplicar' }))
    expect(submit).toHaveBeenCalledTimes(4)
    vi.advanceTimersByTime(300)
    expect(submit).toHaveBeenCalledTimes(4)

    await fireEvent.update(input, 'desmontado')
    unmount()
    vi.advanceTimersByTime(300)
    expect(submit).toHaveBeenCalledTimes(4)
  })
})
