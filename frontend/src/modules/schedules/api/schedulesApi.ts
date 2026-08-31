import { apiClient } from '@/core/api/client'
import type { PublishedSchedule, PublishedScheduleVersion, PublishedScheduleYear, PublishScheduleInput } from '../types/schedules'

export const schedulesApi = {
  listYears(): Promise<PublishedScheduleYear[]> {
    return apiClient.get('/horarios-publicados/anios')
  },
  getCurrent(cicloLectivo?: number): Promise<PublishedSchedule> {
    const query = cicloLectivo === undefined ? '' : `?cicloLectivo=${encodeURIComponent(cicloLectivo)}`
    return apiClient.get(`/horarios-publicados/actual${query}`)
  },
  download(id: number): Promise<Blob> {
    return apiClient.getBlob(`/horarios-publicados/${id}/archivo`)
  },
  publish(input: PublishScheduleInput): Promise<PublishedScheduleVersion> {
    const body = new FormData()
    body.append('archivo', input.archivo)
    body.append('cicloLectivo', String(input.cicloLectivo))
    if (input.titulo?.trim()) body.append('titulo', input.titulo.trim())
    return apiClient.post('/horarios-publicados', body)
  },
  listHistory(cicloLectivo: number): Promise<PublishedSchedule[]> {
    return apiClient.get(`/horarios-publicados/historial?cicloLectivo=${encodeURIComponent(cicloLectivo)}`)
  },
  restore(id: number): Promise<PublishedSchedule> {
    return apiClient.post(`/horarios-publicados/${id}/publicar`)
  },
}
