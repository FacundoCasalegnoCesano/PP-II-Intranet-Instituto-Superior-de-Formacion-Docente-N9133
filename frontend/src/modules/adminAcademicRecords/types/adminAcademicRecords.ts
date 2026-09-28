import type { AcademicRecordCareer, AcademicRecordSubject, AcademicRecordTrajectory } from '@/modules/academicRecord/types/academicRecord'

export interface AdminAcademicStudent {
  idUsuario: number
  apellidoNombre: string
  dni: string | number
  activo: boolean
  email?: string | null
  telefono?: string | null
}

export interface AdminAcademicSubject extends AcademicRecordSubject {
  homologacion?: {
    id?: number
    nota?: number | null
    tipo?: string | null
    fecha?: string | null
  } | null
}

export interface AdminAcademicTrajectory extends Omit<AcademicRecordTrajectory, 'materias'> {
  materias: AdminAcademicSubject[]
}

export type AdminAcademicCareerEnrollment = AcademicRecordCareer & {
  id?: number
  fechaInscripcion?: string | null
  fechaBaja?: string | null
}

export interface AdminAcademicRecordFilters {
  search?: string
  carreraId?: number
  page?: number
  limit?: number
}
