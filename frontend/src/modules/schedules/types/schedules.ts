export interface PublishedSchedule {
  id: number
  cicloLectivo: number
  titulo: string
  nombreOriginal: string
  tamanio: number
  fechaPublicacion: string
  vigente: boolean
  publicadoPor?: {
    id: number
    nombre: string
  }
}

export type PublishedScheduleYear = number

export interface PublishedScheduleVersion {
  documento: PublishedSchedule
  reutilizado: boolean
}

export interface PublishScheduleInput {
  archivo: File
  cicloLectivo: number
  titulo?: string
}
