export type SubjectModality = 'PRESENCIAL' | 'SEMIPRESENCIAL' | 'LIBRE'
export type SubjectCorrelationPending =
  | { tipo: 'MATERIA'; id: number; nombre: string }
  | { tipo: 'ESPACIO'; id: number; nombre: string }

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
  correlativasPendientes: SubjectCorrelationPending[]
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
  estado: 'ACTIVA' | 'RECURSANDO' | 'FINALIZADA' | 'BAJA'
  inscripcionEspacioId?: number | null
  fechaInscripcion?: string
  fechaBaja?: string | null
  materia?: { id: number; nombre: string }
}

export interface SubjectEnrollmentVerification {
  puedeInscribirse: boolean
  materia: AvailableSubject
}

export interface SpaceEnrollmentComponent {
  cursadaId: number
  materia: { id: number; nombre: string; carrera?: { id: number; nombre: string } }
  docente?: { idUsuario: number; apellidoNombre: string } | null
  estadoAcademico?: string | null
  yaCursada: boolean
}
export interface SpaceEnrollmentOffer {
  cursadaEspacioId: number
  espacioCurricular: { id: number; nombre: string; carreraId: number; carrera?: { id: number; nombre: string } }
  anioLectivo: number
  periodo?: string | null
  componentes: SpaceEnrollmentComponent[]
  habilitada: boolean
  yaInscripto: boolean
  aprobado: boolean
  motivos: Array<{ tipo: string; codigo: string; mensaje: string; referenciaId?: number }>
  pendientes: Array<{ nombre?: string; [key: string]: unknown }>
}
export interface SpaceEnrollment extends Omit<SpaceEnrollmentOffer, 'habilitada' | 'yaInscripto' | 'aprobado' | 'motivos' | 'pendientes' | 'componentes'> {
  id: number
  fechaInscripcion: string
  fechaBaja?: string | null
  estado: 'ACTIVA' | 'BAJA'
  componentes: Array<SpaceEnrollmentComponent & { idInscripcionMateria: number; modalidadElegida?: SubjectModality | null }>
}
