import { apiClient, type ApiClient } from '@/core/api/client'
import type {
  AcademicSummary,
  AttendanceSummary,
  ClassRecord,
  ClassSaveResult,
  ClassSummary,
  ClassWritePayload,
  EnrolledStudent,
  GradeFilters,
  GradeRecord,
  SaveGradesPayload,
  TeacherCourse,
  TeacherCourseFilters,
  TeacherCourseListResult,
} from '../types/teacherCourses'

type TeacherCoursesClient = Pick<ApiClient, 'get' | 'getPaginated' | 'post' | 'put'>

function query(params: Record<string, unknown>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const result = search.toString()
  return result ? `?${result}` : ''
}

export const teacherCoursesApi = {
  list(filters: TeacherCourseFilters = {}, client: TeacherCoursesClient = apiClient): Promise<TeacherCourseListResult> {
    return client.getPaginated<TeacherCourse>(`/cursadas${query(filters)}`)
  },
  get(cursadaId: number, client: TeacherCoursesClient = apiClient): Promise<TeacherCourse> {
    return client.get<TeacherCourse>(`/cursadas/${cursadaId}`)
  },
  listStudents(cursadaId: number, client: TeacherCoursesClient = apiClient): Promise<EnrolledStudent[]> {
    return client.get<EnrolledStudent[]>(`/cursadas/${cursadaId}/inscriptos`)
  },
  listClasses(cursadaId: number, client: TeacherCoursesClient = apiClient): Promise<ClassSummary[]> {
    return client.get<ClassSummary[]>(`/cursadas/${cursadaId}/clases`)
  },
  getClass(cursadaId: number, date: string, client: TeacherCoursesClient = apiClient): Promise<ClassRecord> {
    return client.get<ClassRecord>(`/cursadas/${cursadaId}/clases/${date}`)
  },
  saveClass(cursadaId: number, date: string, payload: ClassWritePayload, client: TeacherCoursesClient = apiClient): Promise<ClassSaveResult> {
    return client.put<ClassSaveResult>(`/cursadas/${cursadaId}/clases/${date}`, payload)
  },
  listGrades(cursadaId: number, filters?: GradeFilters, client: TeacherCoursesClient = apiClient): Promise<GradeRecord[]> {
    return client.get<GradeRecord[]>(`/calificaciones/cursada/${cursadaId}${query(filters ?? {})}`)
  },
  saveGrades(payload: SaveGradesPayload, client: TeacherCoursesClient = apiClient): Promise<{ registros: number }> {
    return client.post<{ registros: number }>('/calificaciones/carga-masiva', payload)
  },
  getAttendanceSummary(cursadaId: number, client: TeacherCoursesClient = apiClient): Promise<AttendanceSummary> {
    return client.get<AttendanceSummary>(`/asistencias/resumen/${cursadaId}`)
  },
  getAcademicSummary(cursadaId: number, client: TeacherCoursesClient = apiClient): Promise<AcademicSummary> {
    return client.get<AcademicSummary>(`/estado-academico/cursada/${cursadaId}`)
  },
}
