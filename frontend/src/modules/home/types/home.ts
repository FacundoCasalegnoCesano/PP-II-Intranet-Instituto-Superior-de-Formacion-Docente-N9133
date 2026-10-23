export interface StudentCareer {
  id: number
  carreraId: number
  cicloLectivo?: number | null
  anioCohorte?: number | null
  activo?: boolean
  carrera: {
    id: number
    nombre: string
    activo?: boolean
    materias: Array<{ id: number; nombre?: string }>
  }
}

import type { AcademicRecordSpace } from '@/modules/academicRecord/types/academicRecord'

export interface StudentTrajectory {
  alumnoUsuarioId: number
  carrera: { id: number; nombre: string; duracionAnios: number | null }
  promedioGeneral: number | null
  cantidadMateriasAprobadas: number
  cantidadUnidadesTotal?: number
  espaciosCurriculares?: AcademicRecordSpace[]
  materias: Array<{
    materia?: { id: number; nombre: string }
    espacioCurricular?: { id: number; nombre: string } | null
    estado?: string
    definitiva?: { nota: number; via: string } | null
  }>
}

export interface AcademicProgress {
  approved: number
  total: number
  percent: number
}
