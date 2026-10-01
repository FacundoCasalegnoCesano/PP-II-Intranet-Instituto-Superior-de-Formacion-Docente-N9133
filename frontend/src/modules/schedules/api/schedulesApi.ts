import { apiClient } from '@/core/api/client'
import type { PublishedSchedule, PublishedScheduleVersion, PublishedScheduleYear, PublishScheduleInput, ScheduleOptions } from '../types/schedules'

export const schedulesApi = {
  listYears(): Promise<PublishedScheduleYear[]> {
    return apiClient.get('/horarios-publicados/anios')
  },
  listOptions(cicloLectivo?: number): Promise<ScheduleOptions> {
    const query = cicloLectivo === undefined ? '' : `?cicloLectivo=${encodeURIComponent(cicloLectivo)}`
    return apiClient.get(`/horarios-publicados/opciones${query}`)
  },
  getCurrent(filters: { cicloLectivo?: number; carreraId?: number; cursoAnio?: number } = {}): Promise<PublishedSchedule> {
    const params = new URLSearchParams()
    if (filters.cicloLectivo !== undefined) params.set('cicloLectivo', String(filters.cicloLectivo))
    if (filters.carreraId !== undefined) params.set('carreraId', String(filters.carreraId))
    if (filters.cursoAnio !== undefined) params.set('cursoAnio', String(filters.cursoAnio))
    const query = params.toString() ? `?${params.toString()}` : ''
    return apiClient.get(`/horarios-publicados/actual${query}`)
  },
  download(id: number): Promise<Blob> {
    return apiClient.getBlob(`/horarios-publicados/${id}/archivo`)
  },
  publish(input: PublishScheduleInput): Promise<PublishedScheduleVersion> {
    const body = new FormData()
    body.append('archivo', input.archivo)
    body.append('cicloLectivo', String(input.cicloLectivo))
    body.append('carreraId', String(input.carreraId))
    if (input.titulo?.trim()) body.append('titulo', input.titulo.trim())
    return apiClient.post('/horarios-publicados', body)
  },
  listHistory(filters: { cicloLectivo: number; carreraId?: number; cursoAnio?: number }): Promise<PublishedSchedule[]> {
    const params = new URLSearchParams({ cicloLectivo: String(filters.cicloLectivo) })
    if (filters.carreraId !== undefined) params.set('carreraId', String(filters.carreraId))
    if (filters.cursoAnio !== undefined) params.set('cursoAnio', String(filters.cursoAnio))
    return apiClient.get(`/horarios-publicados/historial?${params.toString()}`)
  },
  restore(id: number): Promise<PublishedSchedule> {
    return apiClient.post(`/horarios-publicados/${id}/publicar`)
  },
}
