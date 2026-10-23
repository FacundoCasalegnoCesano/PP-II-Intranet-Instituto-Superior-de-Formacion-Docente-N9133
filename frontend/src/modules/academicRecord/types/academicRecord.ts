export interface AcademicRecordCareer {
  id: number
  carreraId: number
  cicloLectivo?: number | null
  anioCohorte?: number | null
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
  espacioCurricular?: { id: number; nombre: string } | null
  categoriaTrayectoria?: 'APROBADA' | 'REGULAR' | 'SIN_CURSAR' | 'CURSANDO' | 'REGULARIDAD_VENCIDA' | 'OTRA'
  inscripcion?: { modalidad?: string; cicloLectivo?: number | null; estado?: string; fechaBaja?: string | null } | null
  asistencia?: { porcentaje?: number; presente?: number; totalClases?: number } | null
  cursadas?: AcademicRecordCourse[]
  parcialesEfectivos?: Array<{ numero: number; notaOriginal: number; notaEfectiva: number; recuperado: boolean }>
  regularidad?: { hasta?: string | null; vencida?: boolean } | null
  definitiva?: { nota?: number; via?: string; fecha?: string | null } | null
}

export interface AcademicRecordSpaceComponent {
  materiaId: number
  nombre: string
  estado: string
  definitiva?: { nota?: number | null; via?: string } | null
}

export interface AcademicRecordSpace {
  id: number
  nombre: string
  estado: 'APROBADA' | 'PENDIENTE'
  nota: number | null
  definitiva: { nota: number; via: 'ESPACIO_CURRICULAR' } | null
  componentes: AcademicRecordSpaceComponent[]
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
  cantidadUnidadesTotal?: number
  espaciosCurriculares?: AcademicRecordSpace[]
  materias: AcademicRecordSubject[]
}
