export type SubjectModality = 'PRESENCIAL' | 'SEMIPRESENCIAL' | 'LIBRE'

export interface AvailableSubject {
  id: number
  nombre: string
  curso?: { anio?: number | null } | null
  carrera?: { id: number; nombre: string }
  carreras?: Array<{ id: number; nombre: string }>
  modalidad?: SubjectModality | null
  yaInscripto: boolean
  yaAprobada: boolean
  cumpleCorrelativas: boolean
  correlativasPendientes: Array<{ id: number; nombre: string }>
  habilitada: boolean
}

export interface SubjectEnrollmentInput {
  materiaId: number
  cicloLectivo: number
  modalidadElegida: SubjectModality
}

export interface SubjectEnrollment {
  id: number
  materiaId: number
  cicloLectivo: number
  modalidadElegida: SubjectModality
  estado: 'ACTIVA' | 'RECURSANDO' | 'BAJA'
  fechaInscripcion?: string
  fechaBaja?: string | null
  materia?: { id: number; nombre: string }
}

export interface SubjectEnrollmentVerification {
  puedeInscribirse: boolean
  materia: AvailableSubject
}
