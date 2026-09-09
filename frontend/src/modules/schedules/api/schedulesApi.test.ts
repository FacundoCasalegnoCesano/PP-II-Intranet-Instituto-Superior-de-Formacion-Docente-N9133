import { describe, expect, it, vi } from 'vitest'
import { schedulesApi } from './schedulesApi'

vi.mock('@/core/api/client', () => ({
  apiClient: { get: vi.fn(), getBlob: vi.fn(), post: vi.fn() },
}))

import { apiClient } from '@/core/api/client'

describe('schedulesApi', () => {
  it('uses the published schedules contract paths and sends the upload as multipart form data', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([])
    vi.mocked(apiClient.getBlob).mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }))
    vi.mocked(apiClient.post).mockResolvedValue({ documento: { id: 31 }, reutilizado: false })
    const archivo = new File(['%PDF-1.7'], 'horario 2026.pdf', { type: 'application/pdf' })

    await schedulesApi.listYears()
    await schedulesApi.getCurrent(2026)
    await schedulesApi.download(31)
    await schedulesApi.publish({ archivo, cicloLectivo: 2026, titulo: 'Horarios oficiales' })
    await schedulesApi.listHistory(2026)
    await schedulesApi.restore(30)

    expect(apiClient.get).toHaveBeenNthCalledWith(1, '/horarios-publicados/anios')
    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/horarios-publicados/actual?cicloLectivo=2026')
    expect(apiClient.getBlob).toHaveBeenCalledWith('/horarios-publicados/31/archivo')
    const upload = vi.mocked(apiClient.post).mock.calls[0]?.[1] as FormData
    expect(upload).toBeInstanceOf(FormData)
    expect(upload.get('archivo')).toBe(archivo)
    expect(upload.get('cicloLectivo')).toBe('2026')
    expect(upload.get('titulo')).toBe('Horarios oficiales')
    expect(apiClient.get).toHaveBeenLastCalledWith('/horarios-publicados/historial?cicloLectivo=2026')
    expect(apiClient.post).toHaveBeenLastCalledWith('/horarios-publicados/30/publicar')
  })
})
