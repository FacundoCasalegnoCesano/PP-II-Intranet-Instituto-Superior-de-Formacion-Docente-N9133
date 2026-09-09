export interface CatalogCareer {
  id: number
  nombre: string
  duracionAnios: number
  activo: boolean
}

export interface StudyPlanSubject {
  id: number
  nombre: string
  cargaHoraria: number
  tipoEspacio: string
  modalidad?: string
  periodo?: string
  regimen?: string
  curso: { id: number; anio: number } | null
}

export interface CareerStudyPlan extends CatalogCareer {
  materias: StudyPlanSubject[]
}

export interface CareerCatalogFilters {
  page?: number
  limit?: number
  search?: string
}
