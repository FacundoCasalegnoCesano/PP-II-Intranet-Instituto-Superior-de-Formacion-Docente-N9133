import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import periodoInscripcionService from '../src/services/periodoInscripcionService.js';
import periodoInscripcionRepository from '../src/repositories/periodoInscripcionRepository.js';
import { prisma } from '../src/config/prisma.js';

const originalFindMany = prisma.materia.findMany;

afterEach(() => {
  prisma.materia.findMany = originalFindMany;
});

test('valida varias materias con una sola consulta', async () => {
  let consultas = 0;
  prisma.materia.findMany = (async () => {
    consultas += 1;
    return [{ id: 2 }, { id: 4 }, { id: 6 }];
  }) as any;

  await (periodoInscripcionService as any).validarSeleccion({
    tipo: 'MATERIA', materiasIds: [2, 4, 6]
  });

  assert.equal(consultas, 1);
});

test('la validación agrupada conserva el primer ID inválido', async () => {
  prisma.materia.findMany = (async () => [{ id: 2 }, { id: 6 }]) as any;
  await assert.rejects(
    (periodoInscripcionService as any).validarSeleccion({
      tipo: 'MATERIA', materiasIds: [2, 4, 6]
    }),
    /materia 4 no existe/
  );
});

test('actualiza la descripción sin exigir nuevamente la selección', async () => {
  const originalFindById = periodoInscripcionRepository.findById;
  const originalTransaction = prisma.$transaction;
  periodoInscripcionRepository.findById = (async () => ({
    id: 5,
    tipo: 'MATERIA',
    fechaInicio: new Date('2026-08-01'),
    fechaFin: new Date('2026-09-30')
  })) as any;
  prisma.$transaction = (async (callback: any) => callback({
    periodoInscripcion: {
      update: async ({ data }: any) => ({ id: 5, ...data })
    }
  })) as any;

  try {
    const result = await periodoInscripcionService.updatePeriodo(
      5,
      { descripcion: 'Inscripción ampliada' },
      { rol: 'ADMINISTRATIVO' }
    );
    assert.equal(result.descripcion, 'Inscripción ampliada');
  } finally {
    periodoInscripcionRepository.findById = originalFindById;
    prisma.$transaction = originalTransaction;
  }
});
