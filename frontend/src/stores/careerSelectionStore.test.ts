import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCareerSelectionStore } from './careerSelectionStore'

describe('career selection store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('stores only valid student selections owned by the active identity', () => {
    const store = useCareerSelectionStore()
    store.selectCareer(3, { userId: 13, role: 'ALUMNO' })

    expect(store.selectedCareerId).toBe(3)
    expect(store.isOwnedBy({ userId: 13, role: 'ALUMNO' })).toBe(true)
    expect(store.isOwnedBy({ userId: 14, role: 'ALUMNO' })).toBe(false)
    store.selectCareer(0, { userId: 13, role: 'ALUMNO' })
    store.selectCareer(4, { userId: 13, role: 'PROFESOR' })
    expect(store.selectedCareerId).toBe(3)
  })

  it('clears the preference for all careers', () => {
    const store = useCareerSelectionStore()
    store.selectCareer(3, { userId: 13, role: 'ALUMNO' })
    store.clear()

    expect(store.selectedCareerId).toBeNull()
    expect(store.identity).toBeNull()
  })
})
