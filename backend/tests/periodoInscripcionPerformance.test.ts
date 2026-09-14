import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import periodoInscripcionService from '../src/services/periodoInscripcionService.js';
import periodoInscripcionRepository from '../src/repositories/periodoInscripcionRepository.js';
import { calcularEstadoPeriodo } from '../src/services/periodoInscripcionService.js';
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

test('calcula estados con rango inclusivo y prioridad de desactivado', () => {
  const periodo = {
    activo: true,
    fechaInicio: new Date('2026-12-01T00:00:00.000Z'),
    fechaFin: new Date('2026-12-10T23:59:59.000Z')
  };

  assert.equal(calcularEstadoPeriodo(periodo, new Date('2026-11-30T23:59:59.000Z')), 'PROGRAMADO');
  assert.equal(calcularEstadoPeriodo(periodo, periodo.fechaInicio), 'ABIERTO');
  assert.equal(calcularEstadoPeriodo(periodo, periodo.fechaFin), 'ABIERTO');
  assert.equal(calcularEstadoPeriodo(periodo, new Date('2026-12-11T00:00:00.000Z')), 'FINALIZADO');
  assert.equal(calcularEstadoPeriodo({ ...periodo, activo: false }, periodo.fechaInicio), 'DESACTIVADO');
});

test('el listado solicita conteos relacionales y expone un DTO aditivo', async () => {
  let findManyArgs: any;
  const originalFindMany = prisma.periodoInscripcion.findMany;
  const originalCount = prisma.periodoInscripcion.count;
  const originalRepositoryFindAll = periodoInscripcionRepository.findAll;

  prisma.periodoInscripcion.findMany = (async (args: any) => {
    findManyArgs = args;
    return [{
      id: 9,
      tipo: 'EXAMEN',
      cicloLectivo: 2026,
      fechaInicio: new Date('2026-12-01T00:00:00.000Z'),
      fechaFin: new Date('2026-12-10T23:59:59.000Z'),
      descripcion: 'Primer llamado',
      activo: true,
      _count: { materias: 0, mesas: 8 }
    }];
  }) as any;
  prisma.periodoInscripcion.count = (async () => 1) as any;

  try {
    const result = await periodoInscripcionService.listPeriodos({ page: 1, limit: 20 });
    assert.deepEqual(findManyArgs.include, { _count: { select: { materias: true, mesas: true } } });
    assert.deepEqual(result.data[0], {
      id: 9,
      tipo: 'EXAMEN',
      cicloLectivo: 2026,
      fechaInicio: new Date('2026-12-01T00:00:00.000Z'),
      fechaFin: new Date('2026-12-10T23:59:59.000Z'),
      descripcion: 'Primer llamado',
      activo: true,
      cantidadMaterias: 0,
      cantidadMesas: 8,
      estado: 'PROGRAMADO'
    });
  } finally {
    prisma.periodoInscripcion.findMany = originalFindMany;
    prisma.periodoInscripcion.count = originalCount;
    periodoInscripcionRepository.findAll = originalRepositoryFindAll;
  }
});
