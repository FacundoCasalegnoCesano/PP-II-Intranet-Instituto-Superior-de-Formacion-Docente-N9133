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
  inscripcion?: { modalidad?: string; cicloLectivo?: number; estado?: string; fechaBaja?: string | null } | null
  asistencia?: { porcentaje?: number; presente?: number; totalClases?: number } | null
  parcialesEfectivos?: Array<{ numero?: number; nota?: number; fechaEvaluacion?: string }>
  regularidad?: { hasta?: string | null; vencida?: boolean } | null
  definitiva?: { nota?: number; via?: string; fecha?: string | null } | null
}

export interface AcademicRecordTrajectory {
  alumnoUsuarioId: number
  carrera: { id: number; nombre: string; duracionAnios?: number | null }
  promedioGeneral?: number | null
  cantidadMateriasAprobadas?: number
  materias: AcademicRecordSubject[]
}
