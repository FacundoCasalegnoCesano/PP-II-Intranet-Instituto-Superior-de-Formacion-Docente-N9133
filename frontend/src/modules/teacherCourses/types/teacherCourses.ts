import type { PaginatedResult } from '@/core/api/contracts'

export type TeacherCourseSection = 'students' | 'classes' | 'grades' | 'summary'
export type GradeType = 'PARCIAL' | 'RECUPERATORIO' | 'EXAMEN_FINAL' | 'TRABAJO_PRACTICO'

export interface TeacherCourseSchedule {
  id: number
  cursadaId: number
  dia: string
  horaInicio: string
  horaFin: string
  aula?: string | null
  activo: boolean
}

export interface TeacherCourse {
  id: number
  materiaId?: number
  materia: {
    id: number
    nombre: string
    esPromocionable?: boolean
    notaMinima?: number | null
    carrera?: { id: number; nombre: string }
    curso?: { id: number; anio: number }
  }
  anioLectivo: number
  periodo: string
  docenteId?: number | null
  docente?: { idUsuario: number; apellidoNombre: string; email: string } | null
  horarios: TeacherCourseSchedule[]
  activo: boolean
  editable?: boolean
}

export type TeacherCourseListResult = PaginatedResult<TeacherCourse>

export interface TeacherCourseFilters {
  anioLectivo?: number
  materiaId?: number
  docenteId?: number
  activo?: boolean
  page?: number
  limit?: number
}

export interface EnrolledStudent {
  /** Public contract: Usuario.idUsuario, despite the backend field name alumnoId. */
  alumnoId: number
  apellidoNombre: string
  dni: number
  email: string
}

export interface ClassSummary {
  fecha: string
  temaDesarrollado: string
  presentes: number
  ausentes: number
  ausentesJustificados: number
}

export interface ClassAttendance {
  alumnoId: number
  nombre: string
  dni: number
  presente: boolean
  justificado: boolean
  observacion: string | null
}

export interface ClassRecord {
  fecha: string
  temaDesarrollado: string
  asistencias: ClassAttendance[]
}

export interface ClassAttendanceInput {
  alumnoId: number
  presente: boolean
  justificado?: boolean
  observacion?: string | null
}

export interface ClassWritePayload {
  temaDesarrollado: string
  asistencias: ClassAttendanceInput[]
}

export interface ClassSaveResult {
  fecha: string
  temaDesarrollado: string
  registros: number
}

export interface GradeStudent {
  alumnoId: number
  apellidoNombre: string
  dni: number
}

export interface GradeRecord {
  id: number
  cursadaId: number
  tipoCalificacion: GradeType
  numero: number
  nota: number
  fechaEvaluacion?: string | null
  fechaRegistro?: string
  parcialOriginalId?: number | null
  observacion?: string | null
  alumno: GradeStudent
}

export interface GradeFilters {
  tipo?: GradeType | ''
  numero?: number
  alumnoId?: number
}

export interface GradeInput {
  alumnoId: number
  tipoCalificacion: GradeType
  numero?: number
  fechaEvaluacion?: string
  parcialOriginalId?: number
  nota: number
  observacion?: string | null
}

export interface SaveGradesPayload {
  cursadaId: number
  calificaciones: GradeInput[]
}

export interface AttendanceSummaryStudent {
  /** Existing attendance endpoint still returns the academic Alumno.idAlumno. */
  alumnoId: number
  totalClases: number
  presentes: number
  ausentesJustificados: number
  ausentesInjustificados: number
  porcentajeAsistencia: number | null
  requerido: number
  minimoConTodasJustificadas: number
  todasAusenciasJustificadas: boolean
  cumple: boolean | null
}

export interface AttendanceSummary {
  cursadaId: number
  materia: { id: number; nombre: string }
  anioLectivo: number
  totalClasesTomadas: number
  alumnos: AttendanceSummaryStudent[]
}

export interface AcademicSummaryStudent {
  alumno: GradeStudent
  asistencia: Record<string, unknown> | null
  parcialesEfectivos: Array<{
    numero: number
    notaOriginal: number
    notaEfectiva: number
    recuperado: boolean
  }>
  tps: Record<string, unknown> | null
  promedio: number | null
  notaMinima: number
  estado: string
  requisitosPendientes: string[]
}

export interface AcademicSummary {
  cursadaId: number
  materia: { id: number; nombre: string }
  anioLectivo: number
  periodo: string
  alumnos: AcademicSummaryStudent[]
}
