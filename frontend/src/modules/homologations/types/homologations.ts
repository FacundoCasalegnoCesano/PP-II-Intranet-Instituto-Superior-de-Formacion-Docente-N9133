import type { ApiResponse, PaginatedResult } from '@/core/api/contracts'

export type HomologationType = 'TOTAL' | 'PARCIAL'
export type HomologationStatus = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA'

export interface Homologation {
  id: number
  alumno: {
    idUsuario: number
    apellidoNombre: string
    dni: string
    email: string
  }
  materia: {
    id: number
    nombre: string
    notaMinima: number
    carrera: { id: number; nombre: string }
  }
  tipo: HomologationType
  estado: HomologationStatus
  calificacion: number | null
  notaComplementaria: number | null
  observacion: string | null
  fecha: string
  createdAt: string
  updatedAt: string
}

export interface HomologationFilters {
  search?: string
  estado?: HomologationStatus
  tipo?: HomologationType
  carreraId?: number
  materiaId?: number
  page?: number
  limit?: number
}

interface CreateHomologationBase {
  alumnoId: number
  materiaId: number
  observacion?: string | null
}

export type CreateHomologationPayload =
  | (CreateHomologationBase & { tipoHomologacion: 'TOTAL'; calificacion: number })
  | (CreateHomologationBase & { tipoHomologacion: 'PARCIAL'; calificacion?: null })

export interface ComplementaryGradePayload {
  notaExamenHomologacion: number
}

export interface ResolveHomologationPayload {
  accion: 'APROBAR' | 'RECHAZAR'
}

export type MessageResult<T> = ApiResponse<T>
export type HomologationPage = PaginatedResult<Homologation>

export interface StudentCareer {
  id: number
  carreraId: number
  cicloLectivo?: number
  activo: boolean
  carrera: {
    id: number
    nombre: string
    activo: boolean
    materias: Array<{ id: number; nombre: string }>
  }
}

export interface HomologationCareerOption {
  id: number
  nombre: string
  activo: boolean
}

export interface SubjectOption {
  id: number
  nombre: string
  activo: boolean
  carreraId?: number
}
