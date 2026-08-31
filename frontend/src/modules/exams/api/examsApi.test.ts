import { describe, expect, it, vi } from 'vitest'
import { enrollInExam, fetchAvailableExams, fetchMyExamEnrollments, withdrawFromExam } from './examsApi'

describe('exam API', () => {
  it('keeps student identity in the session and only sends the selected condition', async () => {
    const get = vi.fn().mockResolvedValue([])
    const post = vi.fn().mockResolvedValue({ id: 3 })
    const client = { get, post }

    await fetchAvailableExams(client)
    await fetchMyExamEnrollments(13, client)
    await enrollInExam(9, 'LIBRE', client)
    await withdrawFromExam(9, client)

    expect(get).toHaveBeenNthCalledWith(1, '/examenes/disponibles')
    expect(get).toHaveBeenNthCalledWith(2, '/examenes/alumno/13/inscripciones')
    expect(post).toHaveBeenNthCalledWith(1, '/examenes/9/inscribir', { condicion: 'LIBRE' })
    expect(post).toHaveBeenNthCalledWith(2, '/examenes/9/desinscribir', {})
    expect(JSON.stringify(post.mock.calls)).not.toContain('alumnoId')
  })
})
