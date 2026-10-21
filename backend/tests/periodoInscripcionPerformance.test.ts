import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import periodoInscripcionService from '../src/services/periodoInscripcionService.js';
import periodoInscripcionRepository from '../src/repositories/periodoInscripcionRepository.js';
import { calcularEstadoPeriodo } from '../src/services/periodoInscripcionService.js';
import { prisma } from '../src/config/prisma.js';
import { actualizarPeriodoSchema, crearPeriodoSchema } from '../src/validations/periodoInscripcionValidation.js';

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
  let updateArgs: any;
  periodoInscripcionRepository.findById = (async () => ({
    id: 5,
    tipo: 'MATERIA',
    fechaInicio: new Date('2026-08-01'),
    fechaFin: new Date('2026-09-30')
  })) as any;
  prisma.$transaction = (async (callback: any) => callback({
    $queryRaw: async () => [],
    periodoInscripcion: {
      findUnique: async () => ({
        id: 5,
        tipo: 'MATERIA',
        cicloLectivo: 2026,
        fechaInicio: new Date('2026-08-01'),
        fechaFin: new Date('2026-09-30'),
        materias: [],
        cursadasEspacios: [],
        mesas: []
      }),
      update: async (args: any) => { updateArgs = args; return { id: 5, ...args.data }; }
    }
  })) as any;

  try {
    const result = await periodoInscripcionService.updatePeriodo(
      5,
      { descripcion: 'Inscripción ampliada' },
      { rol: 'ADMINISTRATIVO' }
    );
    assert.equal(result.descripcion, 'Inscripción ampliada');
    assert.deepEqual(updateArgs.include.cursadasEspacios, {
      include: { cursadaEspacio: { select: {
        id: true, espacioCurricularId: true, anioLectivo: true, periodo: true, activo: true,
        espacioCurricular: { select: { id: true, nombre: true, carreraId: true, carrera: { select: { id: true, nombre: true } } } }
      } } }
    });
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
      _count: { materias: 0, cursadasEspacios: 0, mesas: 8 },
      cursadasEspacios: []
    }];
  }) as any;
  prisma.periodoInscripcion.count = (async () => 1) as any;

  try {
    const result = await periodoInscripcionService.listPeriodos({ page: 1, limit: 20 });
    assert.deepEqual(findManyArgs.include, {
      _count: { select: { materias: true, cursadasEspacios: true, mesas: true } },
      cursadasEspacios: { select: { id: true, cursadaEspacioId: true, cursadaEspacio: { select: {
        id: true, espacioCurricularId: true, anioLectivo: true, periodo: true, activo: true,
        espacioCurricular: { select: { id: true, nombre: true, carreraId: true, carrera: { select: { id: true, nombre: true } } } }
      } } } }
    });
    assert.deepEqual(result.data[0], {
      id: 9,
      tipo: 'EXAMEN',
      cicloLectivo: 2026,
      fechaInicio: new Date('2026-12-01T00:00:00.000Z'),
      fechaFin: new Date('2026-12-10T23:59:59.000Z'),
      descripcion: 'Primer llamado',
      activo: true,
      cantidadMaterias: 0,
      cantidadEspacios: 0,
      cursadasEspacios: [],
      cantidadMesas: 8,
      estado: 'PROGRAMADO'
    });
  } finally {
    prisma.periodoInscripcion.findMany = originalFindMany;
    prisma.periodoInscripcion.count = originalCount;
    periodoInscripcionRepository.findAll = originalRepositoryFindAll;
  }
});

test('el alta acepta sólo materias, sólo ofertas de espacio o ambas selecciones', () => {
  const base = {
    tipo: 'MATERIA', cicloLectivo: 2026,
    fechaInicio: '2026-11-01T00:00:00.000Z', fechaFin: '2026-11-30T23:59:59.000Z'
  };
  assert.equal(crearPeriodoSchema.validate({ ...base, materiasIds: [5], cursadasEspaciosIds: [] }).error, undefined);
  assert.equal(crearPeriodoSchema.validate({ ...base, materiasIds: [], cursadasEspaciosIds: [12] }).error, undefined);
  assert.equal(crearPeriodoSchema.validate({ ...base, materiasIds: [5], cursadasEspaciosIds: [12] }).error, undefined);
  assert.ok(crearPeriodoSchema.validate({ ...base, materiasIds: [], cursadasEspaciosIds: [] }).error);
});

test('la actualización rechaza colecciones incompatibles con el tipo destino', async () => {
  assert.ok(actualizarPeriodoSchema.validate({ tipo: 'EXAMEN', cursadasEspaciosIds: [12] }).error);
  assert.ok(actualizarPeriodoSchema.validate({ tipo: 'EXAMEN', materiasIds: [5] }).error);
  assert.ok(actualizarPeriodoSchema.validate({ tipo: 'MATERIA', mesasIds: [8] }).error);

  const originalFindById = periodoInscripcionRepository.findById;
  const originalTransaction = prisma.$transaction;
  let writes = 0;
  periodoInscripcionRepository.findById = (async () => ({
    id: 5, tipo: 'MATERIA', cicloLectivo: 2026,
    fechaInicio: new Date('2026-08-01'), fechaFin: new Date('2026-09-30')
  })) as any;
  prisma.$transaction = (async (callback: any) => callback({
    $queryRaw: async () => [],
    periodoInscripcion: {
      findUnique: async () => ({
        id: 5, tipo: 'MATERIA', cicloLectivo: 2026,
        fechaInicio: new Date('2026-08-01'), fechaFin: new Date('2026-09-30'),
        materias: [], cursadasEspacios: [], mesas: []
      }),
      update: async () => { writes += 1; },
    },
    periodoMesaHabilitada: { deleteMany: async () => { writes += 1; } },
    periodoMateriaHabilitada: { deleteMany: async () => { writes += 1; } },
    periodoEspacioHabilitado: { deleteMany: async () => { writes += 1; } }
  })) as any;
  try {
    await assert.rejects(periodoInscripcionService.updatePeriodo(5, {
      tipo: 'EXAMEN', cursadasEspaciosIds: [12], mesasIds: [8]
    }, { rol: 'ADMINISTRATIVO' }), /no admite materias ni cursadas de espacios/);
    assert.equal(writes, 0);
  } finally {
    periodoInscripcionRepository.findById = originalFindById;
    prisma.$transaction = originalTransaction;
  }
});

test('la respuesta de período incluye el espacio y la carrera para recuperar la selección', async () => {
  const originalFindUnique = prisma.periodoInscripcion.findUnique;
  let args: any;
  const periodShape = { id: 13, cursadasEspacios: [{
    id: 2, cursadaEspacioId: 7,
    cursadaEspacio: { id: 7, espacioCurricularId: 4, anioLectivo: 2026, periodo: 'ANUAL', activo: true, espacioCurricular: {
      id: 4, nombre: 'Espacio de prueba', carreraId: 9, carrera: { id: 9, nombre: 'Carrera de prueba' }
    } }
  }] };
  prisma.periodoInscripcion.findUnique = (async (query: any) => { args = query; return periodShape; }) as any;
  try {
    const result = await periodoInscripcionService.getPeriodoById(13);
    assert.deepEqual(args.include.cursadasEspacios, {
      include: { cursadaEspacio: { select: {
        id: true, espacioCurricularId: true, anioLectivo: true, periodo: true, activo: true,
        espacioCurricular: { select: { id: true, nombre: true, carreraId: true, carrera: { select: { id: true, nombre: true } } } }
      } } }
    });
    assert.deepEqual(result.cursadasEspacios[0].cursadaEspacio.espacioCurricular, periodShape.cursadasEspacios[0].cursadaEspacio.espacioCurricular);
  } finally {
    prisma.periodoInscripcion.findUnique = originalFindUnique;
  }
});
