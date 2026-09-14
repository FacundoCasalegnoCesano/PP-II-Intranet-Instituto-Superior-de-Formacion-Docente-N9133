import { describe, expect, it, vi } from 'vitest'
import {
  closeExamTable,
  listExamTables,
  reopenExamTable,
  saveExamResult,
} from './examsApi'

describe('examManagement API', () => {
  it('serializes backend filters and preserves pagination', async () => {
    const client = { getPaginated: vi.fn().mockResolvedValue({ data: [], pagination: { page: 2 } }) }

    const result = await listExamTables({
      materiaId: 4,
      carreraId: 2,
      cicloLectivo: 2026,
      estadoMesa: 'EN_PROCESO',
      page: 2,
      limit: 20,
    }, client)

    expect(client.getPaginated).toHaveBeenCalledWith(
      '/examenes?materiaId=4&carreraId=2&cicloLectivo=2026&estadoMesa=EN_PROCESO&page=2&limit=20',
    )
    expect(result.pagination.page).toBe(2)
  })

  it('sends zero as a grade and expectedVersion to the result endpoint', async () => {
    const client = { post: vi.fn().mockResolvedValue({ version: 5 }) }

    await saveExamResult(9, { alumnoId: 13, nota: 0, expectedVersion: 4 }, client)

    expect(client.post).toHaveBeenCalledWith('/examenes/9/calificacion', {
      alumnoId: 13,
      nota: 0,
      expectedVersion: 4,
    })
  })

  it('sends absence without a note', async () => {
    const client = { post: vi.fn().mockResolvedValue({ version: 5 }) }

    await saveExamResult(9, { alumnoId: 13, ausente: true, expectedVersion: 4 }, client)

    expect(client.post).toHaveBeenCalledWith('/examenes/9/calificacion', {
      alumnoId: 13,
      ausente: true,
      expectedVersion: 4,
    })
  })

  it('uses expectedVersion for close and the reason for reopen', async () => {
    const client = { post: vi.fn().mockResolvedValue({ version: 8 }) }

    await closeExamTable(9, 7, client)
    await reopenExamTable(9, 'Corrección de acta', 8, client)

    expect(client.post).toHaveBeenNthCalledWith(1, '/examenes/9/cerrar', { expectedVersion: 7 })
    expect(client.post).toHaveBeenNthCalledWith(2, '/examenes/9/reabrir', {
      motivo: 'Corrección de acta',
      expectedVersion: 8,
    })
  })
})
