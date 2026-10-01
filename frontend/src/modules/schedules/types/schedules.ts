export interface PublishedSchedule {
  id: number
  cicloLectivo: number
  titulo: string
  nombreOriginal: string
  tamanio: number
  fechaPublicacion: string
  vigente: boolean
  carreraId: number | null
  cursoAnio: number | null
  carrera: ScheduleCareer | null
  publicadoPor?: {
    id: number
    nombre: string
  }
}

export interface ScheduleCareer {
  id: number
  nombre: string
  duracionAnios: number
}

export interface ScheduleOptions {
  carreras: ScheduleCareer[]
  generalDisponible: boolean
}

export type PublishedScheduleYear = number

export interface PublishedScheduleVersion {
  documento: PublishedSchedule
  reutilizado: boolean
}

export interface PublishScheduleInput {
  archivo: File
  cicloLectivo: number
  carreraId: number
  titulo?: string
}
