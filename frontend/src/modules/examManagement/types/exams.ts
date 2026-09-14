import type { PaginatedResult } from '@/core/api/contracts'

export type ExamType = 'ORAL' | 'ESCRITO'
export type ExamTableStatus = 'ABIERTA' | 'EN_PROCESO' | 'FINALIZADA'
export type TribunalRole = 'PRESIDENTE' | 'VOCAL' | 'SUPLENTE'
export type ExamCondition = 'REGULAR' | 'LIBRE'
export type ExamResultStatus = 'PENDIENTE' | 'AUSENTE' | 'CALIFICADO'

export interface TribunalMember {
  id?: number
  profesorId: number
  apellidoNombre: string
  rolTribunal: TribunalRole
}

export interface ExamListItem {
  id: number
  materia: { id: number; nombre: string; carrera?: { id: number; nombre: string } | null }
  fecha: string
  tipoExamen: ExamType
  llamado: number
  estadoMesa: ExamTableStatus
  version: number
  publicadaEn?: string | null
  tribunales: TribunalMember[]
  _count: { inscripciones: number }
}

export interface ExamDetail extends ExamListItem {
  folioExamen?: string | null
  libroExamen?: string | null
  materia: { id: number; nombre: string; notaMinima?: number | null; carrera?: { id: number; nombre: string } | null }
}

export interface InscriptoResultado {
  id: number
  alumno: { idUsuario: number; apellidoNombre: string; email?: string; dni?: string }
  condicion: ExamCondition
  resultado: ExamResultStatus
  nota: number | null
  aprobado: boolean | null
  notaMinima: number
  ausente: boolean
}

export interface ExamFormValues {
  materiaId: number
  fecha: string
  tipoExamen: ExamType
  llamado: number
  folioExamen: string
  libroExamen: string
}

export interface ExamFilters {
  materiaId?: number
  carreraId?: number
  cicloLectivo?: number
  fechaDesde?: string
  fechaHasta?: string
  estadoMesa?: ExamTableStatus
  page?: number
  limit?: number
}

export interface GradeWriteInput {
  alumnoId: number
  expectedVersion: number
  nota: number
  ausente?: never
}

export interface AbsenceWriteInput {
  alumnoId: number
  expectedVersion: number
  ausente: true
  nota?: never
}

export type ResultWriteInput = GradeWriteInput | AbsenceWriteInput

export interface ExamWriteResponse {
  version: number
  [key: string]: unknown
}

export interface ExamWorkspace {
  detail: ExamDetail
  results: InscriptoResultado[]
}

export interface ExamResultsSnapshot {
  results: InscriptoResultado[]
  version: number
}

export interface SubjectOption { id: number; nombre: string; carrera?: { id: number; nombre: string } | null }
export interface CareerOption { id: number; nombre: string }
export interface TeacherOption { idUsuario: number; apellidoNombre: string; email?: string }

export type ExamPage = PaginatedResult<ExamListItem>
