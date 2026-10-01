import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HorarioPublicadoService } from '../src/services/horarioPublicadoService.js';
import { ROLES } from '../src/constants/roles.js';
import { prisma } from '../src/config/prisma.js';
import { ambitoClave } from '../src/repositories/horarioPublicadoRepository.js';

const admin = { id: 1, rol: ROLES.ADMINISTRATIVO };
const alumno = { id: 2, rol: ROLES.ALUMNO };
const profesor = { id: 3, rol: ROLES.PROFESOR };

function repo(overrides: Record<string, unknown> = {}) {
  return {
    listarAnios: async () => [],
    listarCarrerasElegibles: async () => [{ id: 10, nombre: 'Matemática', duracionAnios: 4 }],
    carreraElegible: async () => true,
    buscarCarrera: async () => ({ id: 99, nombre: 'Otra', duracionAnios: 4, activo: true }),
    buscarVigentePorAmbito: async () => null,
    buscarUltimaVigentePorAmbito: async () => null,
    buscarVigenteGeneral: async () => null,
    buscarUltimaVigenteGeneral: async () => null,
    buscarPorId: async () => null,
    buscarPorCicloYHash: async () => null,
    listarHistorial: async () => [],
    crearYPublicar: async () => ({}),
    publicarExistente: async () => undefined,
    ...overrides
  } as any;
}

test('las opciones de alumno incluyen solo carreras activas inscriptas', async () => {
  const service = new HorarioPublicadoService(repo({
    listarCarrerasElegibles: async (ciclo: number, user: any) => user.id === 2 && ciclo === 2026
      ? [{ id: 10, nombre: 'Matemática', duracionAnios: 4 }]
      : []
  }), {} as any, 'C:/private');

  const result = await service.listarOpciones(2026, alumno);
  assert.deepEqual(result.carreras, [{ id: 10, nombre: 'Matemática', duracionAnios: 4 }]);
});

test('el profesor no puede consultar un ámbito de carrera no asignado', async () => {
  const service = new HorarioPublicadoService(repo({ carreraElegible: async () => false }), {} as any, 'C:/private');
  await assert.rejects(service.obtenerActual(2026, { carreraId: 99, cursoAnio: 1 }, profesor), (error: any) => error.statusCode === 403);
});

test('las nuevas publicaciones requieren carrera y rechazan año curricular', async () => {
  const service = new HorarioPublicadoService(repo(), {} as any, 'C:/private');
  await assert.rejects(service.publicarArchivo({ cicloLectivo: 2026 }, undefined, admin), (error: any) => error.statusCode === 400);
  await assert.rejects(service.publicarArchivo({ cicloLectivo: 2026, carreraId: 10, cursoAnio: 1 }, undefined, admin), /sólo aplica a históricos/);
});

test('separar ámbitos completos y legacy conserva ciclos independientes', () => {
  assert.equal(ambitoClave({ carreraId: 10 }), 'CARRERA:10');
  assert.equal(ambitoClave({ carreraId: 10, cursoAnio: 2 }), 'CARRERA:10:ANIO:2');
  assert.notEqual(ambitoClave({ carreraId: 10 }), ambitoClave({ carreraId: 11 }));
});

test('la descarga por ID rechaza una carrera ajena antes de tocar el archivo', async () => {
  let accesos = 0;
  const service = new HorarioPublicadoService(repo({
    buscarPorId: async () => ({ id: 7, cicloLectivo: 2026, carreraId: 10, cursoAnio: 1, claveInterna: 'x', publicacionVigente: { cicloLectivo: 2026 } }),
    buscarCarrera: async () => ({ id: 10, nombre: 'Otra', duracionAnios: 4, activo: true }),
    carreraElegible: async () => false
  }), { access: async () => { accesos++; } } as any, 'C:/private');
  await assert.rejects(service.obtenerArchivo(7, alumno), (error: any) => error.statusCode === 403);
  assert.equal(accesos, 0);
});

test('rechaza años fuera de duración y carreras inactivas', async () => {
  const service = new HorarioPublicadoService(repo({ buscarCarrera: async (id: number) => ({ id, nombre: 'Carrera', duracionAnios: 2, activo: id !== 20 }) }), {} as any, 'C:/private');
  await assert.rejects(service.obtenerActual(2026, { carreraId: 10, cursoAnio: 3 }, alumno), (error: any) => error.statusCode === 400);
  await assert.rejects(service.obtenerActual(2026, { carreraId: 20, cursoAnio: 1 }, alumno), (error: any) => error.statusCode === 400);
});

test('listYears omite años que solo tienen carreras ajenas', async () => {
  const service = new HorarioPublicadoService(repo({
    listarAnios: async () => [{ cicloLectivo: 2026, carreraId: 10 }, { cicloLectivo: 2025, carreraId: 20 }],
    carreraElegible: async (_ciclo: number, carreraId: number) => carreraId === 10
  }), {} as any, 'C:/private');
  assert.deepEqual(await service.listarAnios(alumno), [2026]);
});

test('la consulta de profesor contempla asignación vigente y cursada del ciclo', async () => {
  const original = (prisma.carrera as any).findMany;
  let captured: any;
  (prisma.carrera as any).findMany = async (args: any) => { captured = args.where; return []; };
  try {
    await (await import('../src/repositories/horarioPublicadoRepository.js')).default.listarCarrerasElegibles(2026, profesor);
  } finally { (prisma.carrera as any).findMany = original; }
  assert.equal(captured.activo, true);
  assert.equal(captured.materias.some.OR.length, 2);
  assert.equal(captured.materias.some.OR[0].profesorMaterias.some.anioLectivo, undefined);
  assert.equal(captured.materias.some.OR[1].cursadas.some.anioLectivo, 2026);
});
