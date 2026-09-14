export type ExamCondition = 'REGULAR' | 'LIBRE'
export type ExamResultStatus = 'PENDIENTE' | 'EN_REVISION' | 'AUSENTE' | 'CALIFICADO'

export interface AvailableExam {
  id: number
  materia: { id: number; nombre: string; carrera: { id: number; nombre: string } }
  fecha: string
  tipoExamen: 'ORAL' | 'ESCRITO'
  llamado: number
  tribunal: Array<{ profesorId: number; apellidoNombre: string; rolTribunal: string }>
  condicion: ExamCondition
  inscripto: boolean
  version: number
}

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
