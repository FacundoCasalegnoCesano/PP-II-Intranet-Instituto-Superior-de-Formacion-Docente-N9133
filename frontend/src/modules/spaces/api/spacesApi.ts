import { apiClient } from '@/core/api/client'

export interface SpaceComponent { id: number; nombre: string }
export interface CurriculumSpace {
  id: number; nombre: string; carreraId: number | null; carrera?: { id: number; nombre: string } | null
  descripcion: string | null; activo: boolean; composicionBloqueadaAt: string | null; materias: SpaceComponent[]
}
export interface CareerOption { id: number; nombre: string }
export interface SubjectOption { id: number; nombre: string; carreraId: number; activo: boolean }
export interface SpacePrerequisite {
  id: number; materiaRequeridaId?: number | null; espacioRequeridoId?: number | null
  materiaRequerida?: SpaceComponent | null; espacioRequerido?: { id: number; nombre: string } | null
  aplicaCursado: boolean; aplicaRendir: boolean
}
export interface SpaceWriteInput {
  nombre: string; carreraId: number; descripcion?: string; componentesIds: number[]
  correlatividades?: SpacePrerequisiteInput[]; revisarCorrelatividadesComponentes?: boolean
}
export interface SpacePrerequisiteInput {
  materiaRequeridaId?: number; espacioRequeridoId?: number; aplicaCursado: boolean; aplicaRendir: boolean
}

export const spacesApi = {
  list(): Promise<CurriculumSpace[]> { return apiClient.get('/espacios-curriculares') },
  get(id: number): Promise<CurriculumSpace> { return apiClient.get(`/espacios-curriculares/${id}`) },
  create(input: SpaceWriteInput): Promise<CurriculumSpace> { return apiClient.post('/espacios-curriculares', input) },
  update(id: number, input: Partial<Pick<SpaceWriteInput, 'nombre' | 'descripcion' | 'componentesIds' | 'revisarCorrelatividadesComponentes'>>): Promise<CurriculumSpace> {
    return apiClient.patch(`/espacios-curriculares/${id}`, input)
  },
  activate(id: number): Promise<CurriculumSpace> { return apiClient.post(`/espacios-curriculares/${id}/activate`) },
  prerequisites(id: number): Promise<SpacePrerequisite[]> { return apiClient.get(`/espacios-curriculares/${id}/correlatividades`) },
  addPrerequisite(id: number, input: SpacePrerequisiteInput): Promise<SpacePrerequisite> {
    return apiClient.post(`/espacios-curriculares/${id}/correlatividades`, input)
  },
  removePrerequisite(id: number, prerequisiteId: number): Promise<void> {
    return apiClient.delete(`/espacios-curriculares/${id}/correlatividades/${prerequisiteId}`)
  },
}
