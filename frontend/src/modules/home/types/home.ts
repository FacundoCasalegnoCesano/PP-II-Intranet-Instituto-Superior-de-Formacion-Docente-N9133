export interface StudentCareer {
  id: number
  carreraId: number
  cicloLectivo?: number
  carrera: {
    id: number
    nombre: string
    activo?: boolean
    materias: Array<{ id: number; nombre?: string }>
  }
}

export interface StudentTrajectory {
  alumnoUsuarioId: number
  carrera: { id: number; nombre: string; duracionAnios: number | null }
  promedioGeneral: number | null
  cantidadMateriasAprobadas: number
  materias: Array<{
    materia?: { id: number; nombre: string }
    estado?: string
    definitiva?: { nota: number; via: string } | null
  }>
}

export interface AcademicProgress {
  approved: number
  total: number
  percent: number
}
