export type ExamCondition = 'REGULAR' | 'LIBRE'
export type ExamAvailabilityState = 'HABILITADA' | 'NO_HABILITADA' | 'YA_INSCRIPTO'
export type ExamReasonCode = 'PERIODO' | 'CORRELATIVA' | 'CONDICION'
export interface ExamAvailabilityReason {
  codigo: ExamReasonCode
  materiaRequeridaId?: number
  materiaRequeridaNombre?: string
  mensaje: string
}
export type ExamResultStatus = 'PENDIENTE' | 'EN_REVISION' | 'AUSENTE' | 'CALIFICADO'

interface ExamAvailabilityBase {
  id: number
  materia: { id: number; nombre: string; carrera: { id: number; nombre: string } }
  fecha: string
  tipoExamen: 'ORAL' | 'ESCRITO'
  llamado: number
  tribunal: Array<{ profesorId: number; apellidoNombre: string; rolTribunal: string }>
  version: number
}

export interface LegacyAvailableExam extends ExamAvailabilityBase {
  condicion: ExamCondition
  inscripto: boolean
}

export type ExamAvailability =
  | (ExamAvailabilityBase & { estadoDisponibilidad: 'HABILITADA'; condicion: ExamCondition; inscripto: false; motivos: [] })
  | (ExamAvailabilityBase & { estadoDisponibilidad: 'NO_HABILITADA'; condicion: ExamCondition | null; inscripto: false; motivos: [ExamAvailabilityReason, ...ExamAvailabilityReason[]] })
  | (ExamAvailabilityBase & { estadoDisponibilidad: 'YA_INSCRIPTO'; condicion: ExamCondition; inscripto: true; motivos: [] })

export type AvailableExam = LegacyAvailableExam | ExamAvailability

export interface ExamEnrollment {
  id: number
  mesaId: number
  condicion: ExamCondition
  materia: { id: number; nombre: string }
  fecha: string
  estadoResultado: ExamResultStatus
  nota: number | null
  aprobado: boolean | null
  notaMinima: number
}
