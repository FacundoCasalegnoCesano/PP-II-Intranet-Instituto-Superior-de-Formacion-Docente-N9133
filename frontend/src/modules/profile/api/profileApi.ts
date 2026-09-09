import { apiClient } from '@/core/api/client'
import type { ChangeOwnPasswordInput, OwnProfile, OwnProfileInput } from '../types/profile'

interface ApiReader { get<T>(path: string): Promise<T> }
interface ApiWriter { put<T>(path: string, body?: unknown): Promise<T> }

const PROFILE_FIELDS = ['apellidoNombre', 'dni', 'email', 'fechaNacimiento', 'telefono', 'cuil', 'contactoEmergencia', 'foto'] as const

export function profilePayload(input: OwnProfileInput): OwnProfileInput {
  return Object.fromEntries(PROFILE_FIELDS.flatMap((field) => input[field] === undefined ? [] : [[field, input[field]]])) as OwnProfileInput
}

export function fetchOwnProfile(client: ApiReader = apiClient): Promise<OwnProfile> {
  return client.get<OwnProfile>('/auth/me')
}

export function updateOwnProfile(userId: number, input: OwnProfileInput, client: ApiWriter = apiClient): Promise<OwnProfile> {
  return client.put<OwnProfile>(`/users/${userId}`, profilePayload(input))
}

export function changeOwnPassword(input: ChangeOwnPasswordInput, client: ApiWriter = apiClient): Promise<{ message: string }> {
  return client.put<{ message: string }>('/auth/change-password', input)
}
