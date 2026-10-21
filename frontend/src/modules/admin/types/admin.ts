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
  anioEgreso?: number | null
  institucionProcedencia?: string | null
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
  modalidad?: string | null
  periodo?: string | null
  regimen?: string | null
  carreraId?: number
  espacioCurricularId?: number | null
  carrera?: Career
  cursoId?: number | null
  curso?: { id: number; anio: number; carreraId?: number }
  activo: boolean
  correlatividades?: Prerequisite[]
  profesorMaterias?: TeachingAssignment[]
}

export interface SubjectWritePayload {
  nombre: string
  carreraId: number
  cursoAnio: number
  cargaHoraria: number
  tipoEspacio: string
  correlativasIds?: number[]
  correlatividades?: CorrelativityWrite[]
  descripcion?: string
  horasCatedra?: string
  modalidad?: string
  periodo?: string
  regimen?: string
}

export interface SubjectYearGroup {
  anio: number | null
  cantidad: number
  materias: Subject[]
}

export interface Prerequisite {
  id: number
  materiaOrigenId: number
  tipoDestino?: 'MATERIA' | 'ESPACIO'
  materiaRequeridaId: number | null
  espacioRequeridoId?: number | null
  materiaRequerida: Subject | null
  espacioRequerido?: { id: number; nombre: string; carreraId?: number } | null
  tipoRequisito: 'OBLIGATORIA'
  aplicaCursado?: boolean
  aplicaRendir?: boolean
}

export interface CorrelativityWrite {
  materiaRequeridaId?: number
  espacioRequeridoId?: number
  aplicaCursado: boolean
  aplicaRendir: boolean
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
  estadoCursada?: 'FINALIZADA' | 'ACTIVA' | 'INACTIVA'
}

export interface SpaceCourseOffering {
  id: number
  espacioCurricularId: number
  espacioCurricular: { id: number; nombre: string; carreraId: number; carrera?: Career }
  anioLectivo: number
  periodo?: string | null
  activo: boolean
  estadoCursada?: 'FINALIZADA' | 'ACTIVA' | 'INACTIVA'
  componentes: Array<{
    cursadaId: number
    materiaId: number
    materia: Subject
    docenteId?: number | null
    docente?: Pick<PublicUser, 'idUsuario' | 'apellidoNombre' | 'email'> | null
    anioLectivo?: number
    periodo?: string | null
  }>
}
export interface SpaceCourseOfferingReference extends Pick<SpaceCourseOffering, 'id' | 'espacioCurricularId' | 'espacioCurricular' | 'anioLectivo' | 'periodo' | 'activo'> {}

export interface EnrollmentPeriod {
  id: number
  tipo: 'MATERIA' | 'EXAMEN'
  cicloLectivo?: number | null
  fechaInicio: string
  fechaFin: string
  materias?: Array<Subject | { materia: Subject; materiaId: number }>
  mesas?: Array<{ id?: number; mesaId: number; mesa?: AdminExam }>
  descripcion?: string | null
  activo: boolean
  cantidadMaterias: number
  cantidadMesas: number
  cantidadEspacios?: number
  cursadasEspacios?: Array<{ id?: number; cursadaEspacioId: number; cursadaEspacio?: SpaceCourseOfferingReference }>
  estado: PeriodStatus
}

export type PeriodStatus = 'DESACTIVADO' | 'PROGRAMADO' | 'ABIERTO' | 'FINALIZADO'

export interface AdminExam {
  id: number
  materia: Pick<Subject, 'id' | 'nombre'>
  fecha: string
  tipoExamen: string
  llamado: number
  tribunales?: unknown[]
  _count?: { inscripciones: number }
}

export interface ActiveStudent {
  idUsuario: number
  apellidoNombre: string
  dni: string | number
  email: string
  activo: boolean
  rol: string
}

export interface CareerEnrollment {
  id: number
  usuario: Pick<ActiveStudent, 'idUsuario' | 'apellidoNombre' | 'dni' | 'email'>
  cicloLectivo?: number | null
  anioCohorte?: number | null
  fechaInscripcion: string
  activo: boolean
}

export interface CareerEnrollmentWritePayload {
  alumnoId: number
  carreraId: number
  anioCohorte?: number | null
}

export type AdminPageResult<T> = PaginatedResult<T>
