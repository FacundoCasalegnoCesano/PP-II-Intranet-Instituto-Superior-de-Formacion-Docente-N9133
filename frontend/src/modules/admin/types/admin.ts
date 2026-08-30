import type { PublicUser, Role } from '@/core/auth/contracts'
import type { PaginatedResult } from '@/core/api/contracts'

export type AdminUserDetail = Omit<PublicUser, 'dni' | 'rol'> & {
  dni: string
  roles: Role[]
  rol: Role
  alumno: AlumnoProfile | null
}

export interface AlumnoProfile {
  idAlumno?: number
  usuarioId?: number
  domicilio: string
  anioEgreso: number | null
  institucionProcedencia: string | null
}

export interface Career {
  id: number
  nombre: string
  duracionAnios: number
  activo: boolean
  materias?: Subject[]
}

export interface Subject {
  id: number
  nombre: string
  descripcion?: string | null
  cargaHoraria: number
  horasCatedra?: string | null
  tipoEspacio: string
  modalidad?: string
  periodo?: string
  regimen?: string
  carreraId?: number
  carrera?: Career
  cursoId?: number | null
  curso?: { id: number; anio: number; carreraId?: number }
  activo: boolean
  correlatividades?: Prerequisite[]
  profesorMaterias?: TeachingAssignment[]
}

export interface Prerequisite {
  id: number
  materiaOrigenId: number
  materiaRequeridaId: number
  materiaRequerida: Subject
  tipoRequisito: 'OBLIGATORIA'
  aplicaCursado?: boolean
  aplicaRendir?: boolean
}

export interface TeachingAssignment {
  id: number
  profesorId: number
  materiaId: number
  profesor: Pick<PublicUser, 'idUsuario' | 'apellidoNombre' | 'email'>
  fechaAsignacion?: string
  fechaBaja?: string | null
  activo: boolean
}

export interface Schedule {
  id: number
  cursadaId: number
  dia: string
  horaInicio: string
  horaFin: string
  aula?: string | null
  activo: boolean
}

export interface CourseOffering {
  id: number
  materiaId?: number
  materia: Subject
  anioLectivo: number
  periodo: string
  docenteId?: number | null
  docente?: Pick<PublicUser, 'idUsuario' | 'apellidoNombre' | 'email'> | null
  horarios: Schedule[]
  activo: boolean
}

export interface EnrollmentPeriod {
  id: number
  tipo: 'MATERIA' | 'EXAMEN'
  cicloLectivo: number
  fechaInicio: string
  fechaFin: string
  materias?: Array<Subject | { materia: Subject; materiaId: number }>
  mesas?: unknown[]
  descripcion?: string | null
  activo: boolean
}

export type AdminPageResult<T> = PaginatedResult<T>
