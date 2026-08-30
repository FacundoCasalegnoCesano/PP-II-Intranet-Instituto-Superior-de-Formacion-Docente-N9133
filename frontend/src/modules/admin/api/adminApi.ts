import { apiClient } from '@/core/api/client'
import type { PaginationMeta, PaginatedResult } from '@/core/api/contracts'
import type {
  AdminUserDetail,
  AlumnoProfile,
  Career,
  CourseOffering,
  EnrollmentPeriod,
  Prerequisite,
  Schedule,
  Subject,
  TeachingAssignment,
} from '../types/admin'

export interface AdminUserListFilters { search?: string; rol?: string; activo?: boolean; page?: number; limit?: number }
export interface CareerListFilters { search?: string; activo?: boolean; page?: number; limit?: number }
export interface SubjectListFilters { search?: string; carreraId?: number; tipoEspacio?: string; activo?: boolean; page?: number; limit?: number }
export interface CourseListFilters { anioLectivo?: number; materiaId?: number; docenteId?: number; activo?: boolean; page?: number; limit?: number }
export interface PeriodListFilters { tipo?: 'MATERIA' | 'EXAMEN'; activo?: boolean; cicloLectivo?: number; page?: number; limit?: number }

function query(params: Record<string, unknown>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const result = search.toString()
  return result ? `?${result}` : ''
}

function paginated<T>(result: PaginatedResult<T>): PaginatedResult<T> { return result }

export const adminApi = {
  listUsers(filters: AdminUserListFilters = {}): Promise<PaginatedResult<AdminUserDetail>> {
    return apiClient.getPaginated<AdminUserDetail>(`/users${query(filters)}`).then(paginated)
  },
  getUser(id: number): Promise<AdminUserDetail> { return apiClient.get(`/users/${id}`) },
  createUser(role: 'ALUMNO' | 'PROFESOR' | 'ADMINISTRATIVO', payload: Record<string, unknown>): Promise<AdminUserDetail> {
    const endpoint = role === 'ALUMNO' ? '/alumnos' : role === 'PROFESOR' ? '/profesores' : '/administrativos'
    const alumno = payload.alumno && typeof payload.alumno === 'object' ? payload.alumno as Record<string, unknown> : undefined
    const { alumno: _alumno, ...common } = payload
    return apiClient.post(endpoint, { ...common, ...(role === 'ALUMNO' && alumno ? alumno : {}), rol: role })
  },
  updateUser(id: number, payload: Record<string, unknown>): Promise<AdminUserDetail> { return apiClient.put(`/users/${id}`, payload) },
  setUserActive(id: number, active: boolean): Promise<AdminUserDetail> { return apiClient.put(`/users/${id}/activate`, { active }) },
  setUserRole(id: number, rol: 'ALUMNO' | 'PROFESOR' | 'ADMINISTRATIVO', alumno?: AlumnoProfile): Promise<AdminUserDetail> {
    return apiClient.put(`/users/${id}/role`, { rol, ...(alumno ? { alumno } : {}) })
  },
  removeUserRole(id: number, rol: string): Promise<AdminUserDetail> { return apiClient.delete(`/users/${id}/role/${encodeURIComponent(rol)}`) },

  listCareers(filters: CareerListFilters = {}): Promise<PaginatedResult<Career>> { return apiClient.getPaginated(`/carreras${query(filters)}`) },
  getCareer(id: number): Promise<Career> { return apiClient.get(`/carreras/${id}`) },
  getCareerPlan(id: number): Promise<Career> { return apiClient.get(`/carreras/${id}/plan-estudio`) },
  createCareer(payload: Pick<Career, 'nombre' | 'duracionAnios'>): Promise<Career> { return apiClient.post('/carreras', payload) },
  updateCareer(id: number, payload: Partial<Pick<Career, 'nombre' | 'duracionAnios' | 'activo'>>): Promise<Career> { return apiClient.put(`/carreras/${id}`, payload) },
  deactivateCareer(id: number): Promise<void> { return apiClient.delete(`/carreras/${id}`) },

  listSubjects(filters: SubjectListFilters = {}): Promise<PaginatedResult<Subject>> { return apiClient.getPaginated(`/materias${query(filters)}`) },
  getSubject(id: number): Promise<Subject> { return apiClient.get(`/materias/${id}`) },
  createSubject(payload: Record<string, unknown>): Promise<Subject> { return apiClient.post('/materias', payload) },
  updateSubject(id: number, payload: Record<string, unknown>): Promise<Subject> { return apiClient.put(`/materias/${id}`, payload) },
  deactivateSubject(id: number): Promise<void> { return apiClient.delete(`/materias/${id}`) },
  getSubjectsByYear(careerId: number): Promise<Array<{ anio: number; materias: Subject[] }>> { return apiClient.get(`/materias/carrera/${careerId}/por-anio`) },
  getPrerequisites(id: number): Promise<Prerequisite[]> { return apiClient.get(`/materias/${id}/correlatividades`) },
  addPrerequisite(id: number, payload: { materiaRequeridaId: number; tipoRequisito: 'OBLIGATORIA'; aplicaCursado?: boolean; aplicaRendir?: boolean }): Promise<Prerequisite> { return apiClient.post(`/materias/${id}/correlatividades`, payload) },
  removePrerequisite(id: number): Promise<void> { return apiClient.delete(`/materias/correlatividades/${id}`) },
  getTeachingAssignments(id: number): Promise<TeachingAssignment[]> { return apiClient.get(`/materias/${id}/profesores`) },
  assignTeacher(id: number, profesorId: number): Promise<TeachingAssignment> { return apiClient.post(`/materias/${id}/profesores`, { profesorId }) },
  removeTeacher(id: number, profesorId: number): Promise<void> { return apiClient.delete(`/materias/${id}/profesores/${profesorId}`) },

  listCourses(filters: CourseListFilters = {}): Promise<PaginatedResult<CourseOffering>> { return apiClient.getPaginated(`/cursadas${query(filters)}`) },
  getCourse(id: number): Promise<CourseOffering> { return apiClient.get(`/cursadas/${id}`) },
  createCourse(payload: Record<string, unknown>): Promise<CourseOffering> { return apiClient.post('/cursadas', payload) },
  updateCourse(id: number, payload: Record<string, unknown>): Promise<CourseOffering> { return apiClient.put(`/cursadas/${id}`, payload) },
  deactivateCourse(id: number): Promise<void> { return apiClient.delete(`/cursadas/${id}`) },
  getSchedules(courseId: number): Promise<Schedule[]> { return apiClient.get(`/horarios/cursada/${courseId}`) },
  createSchedule(payload: Record<string, unknown>): Promise<Schedule> { return apiClient.post('/horarios', payload) },
  updateSchedule(id: number, payload: Record<string, unknown>): Promise<Schedule> { return apiClient.put(`/horarios/${id}`, payload) },
  deleteSchedule(id: number): Promise<void> { return apiClient.delete(`/horarios/${id}`) },

  listPeriods(filters: PeriodListFilters = {}): Promise<PaginatedResult<EnrollmentPeriod>> { return apiClient.getPaginated(`/periodos-inscripcion${query(filters)}`) },
  getPeriod(id: number): Promise<EnrollmentPeriod> { return apiClient.get(`/periodos-inscripcion/${id}`) },
  createPeriod(payload: Record<string, unknown>): Promise<EnrollmentPeriod> { return apiClient.post('/periodos-inscripcion', payload) },
  updatePeriod(id: number, payload: Record<string, unknown>): Promise<EnrollmentPeriod> { return apiClient.put(`/periodos-inscripcion/${id}`, payload) },
  deactivatePeriod(id: number): Promise<void> { return apiClient.delete(`/periodos-inscripcion/${id}`) },
}

export type { PaginationMeta }
