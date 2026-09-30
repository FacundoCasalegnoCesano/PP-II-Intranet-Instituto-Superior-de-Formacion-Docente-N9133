export interface AcademicRecordCareer {
  id: number
  carreraId: number
  cicloLectivo?: number
  activo?: boolean
  carrera: {
    id: number
    nombre: string
    activo?: boolean
    materias?: Array<{ id: number; nombre?: string }>
  }
}

export interface AcademicRecordSubject {
  materia: { id: number; nombre: string }
  plan?: { anio?: number | null; posicion?: number }
  estado: string
  categoriaTrayectoria?: 'APROBADA' | 'REGULAR' | 'SIN_CURSAR' | 'CURSANDO' | 'REGULARIDAD_VENCIDA' | 'OTRA'
  inscripcion?: { modalidad?: string; cicloLectivo?: number; estado?: string; fechaBaja?: string | null } | null
  asistencia?: { porcentaje?: number; presente?: number; totalClases?: number } | null
  cursadas?: AcademicRecordCourse[]
  parcialesEfectivos?: Array<{ numero?: number; nota?: number; fechaEvaluacion?: string }>
  regularidad?: { hasta?: string | null; vencida?: boolean } | null
  definitiva?: { nota?: number; via?: string; fecha?: string | null } | null
}

export interface AcademicRecordCourse {
  cursadaId: number
  anioLectivo: number
  periodo?: string | null
  activo?: boolean
  asistencia?: { porcentaje?: number; presente?: number; totalClases?: number } | null
}

export interface AcademicRecordAttendance {
  cursadaId: number
  materia: { id: number; nombre: string }
  anioLectivo: number
  periodo?: string | null
  fecha: string
  presente: boolean
  justificado: boolean
}

export interface AcademicRecordTrajectory {
  alumnoUsuarioId: number
  carrera: { id: number; nombre: string; duracionAnios?: number | null }
  promedioGeneral?: number | null
  cantidadMateriasAprobadas?: number
  materias: AcademicRecordSubject[]
}
