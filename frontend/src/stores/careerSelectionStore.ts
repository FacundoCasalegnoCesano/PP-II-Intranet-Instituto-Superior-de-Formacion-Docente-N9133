import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { Role } from '@/core/auth/contracts'

export interface CareerSelectionIdentity {
  userId: number | null
  role: Role | null | undefined
}

export const useCareerSelectionStore = defineStore('careerSelection', () => {
  const selectedCareerId = ref<number | null>(null)
  const identity = ref<{ userId: number; role: 'ALUMNO' } | null>(null)

  function selectCareer(careerId: number, owner: CareerSelectionIdentity): void {
    if (!Number.isInteger(careerId) || careerId < 1 || owner.userId === null || owner.role !== 'ALUMNO') return
    selectedCareerId.value = careerId
    identity.value = { userId: owner.userId, role: 'ALUMNO' }
  }

  function clear(): void {
    selectedCareerId.value = null
    identity.value = null
  }

  function isOwnedBy(owner: CareerSelectionIdentity): boolean {
    const selected = identity.value
    return selectedCareerId.value !== null
      && selected !== null
      && selected.userId === owner.userId
      && selected.role === owner.role
  }

  return { selectedCareerId: computed(() => selectedCareerId.value), identity: computed(() => identity.value), selectCareer, clear, isOwnedBy }
})
