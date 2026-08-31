export type ExamCondition = 'REGULAR' | 'LIBRE'

export interface AvailableExam {
  id: number
  materia: { id: number; nombre: string; carrera: { id: number; nombre: string } }
  fecha: string
  tipoExamen: 'ORAL' | 'ESCRITO'
  llamado: number
  tribunal: Array<{ profesorId: number; apellidoNombre: string; rolTribunal: string }>
  condicion: ExamCondition
  inscripto: boolean
}

export interface ExamEnrollment {
  id: number
  mesaId: number
  condicion: ExamCondition
  fechaInscripcion?: string
  fechaBaja?: string | null
  mesa?: { id: number; fecha: string; materia?: { id: number; nombre: string } }
}
