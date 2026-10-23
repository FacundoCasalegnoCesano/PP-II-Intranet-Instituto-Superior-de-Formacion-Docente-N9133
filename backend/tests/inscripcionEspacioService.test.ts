import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { prisma } from '../src/config/prisma.js';
import alumnoRepository from '../src/repositories/alumnoRepository.js';
import { ROLES } from '../src/constants/roles.js';
import estadoAcademicoService from '../src/services/estadoAcademicoService.js';
import inscripcionEspacioService from '../src/services/inscripcionEspacioService.js';
import { anioInstitucionalActual } from '../src/utils/cicloLectivo.js';

const restorations: Array<() => void> = [];

function replaceMethod(target: Record<string, unknown>, key: string, replacement: unknown) {
  const original = target[key];
  target[key] = replacement;
  restorations.push(() => {
    if (original === undefined) delete target[key];
    else target[key] = original;
  });
}

afterEach(() => {
  while (restorations.length > 0) restorations.pop()?.();
});

test('una materia requerida EN_CURSO no satisface correlatividad de espacio', async () => {
  replaceMethod(estadoAcademicoService, 'getMapaEstadosPorMateria', async () => new Map([[50, 'EN_CURSO']] as any));
  replaceMethod(estadoAcademicoService, 'getMateriasAprobadasSet', async () => new Set());
  replaceMethod(prisma.espacioCorrelatividad as any, 'findMany', async () => [{
    id: 3,
    materiaRequerida: { id: 50, nombre: 'Materia previa' },
    espacioRequerido: null
  }]);

  const result = await (inscripcionEspacioService as any).academicFacts(12, 7, [81, 82]);

  assert.equal(result.correlatividades.cumple, false);
  assert.equal(result.pendientes[0].nombre, 'Materia previa');
});

test('alumno no puede verificar ni autoinscribirse a una cursada de espacio anterior', async () => {
  const year = anioInstitucionalActual() - 1;
  replaceMethod(prisma.usuario as any, 'findUnique', async () => ({ idUsuario: 22, rol: ROLES.ALUMNO, activo: true }));
  replaceMethod(alumnoRepository as any, 'findByUsuarioId', async () => ({ idAlumno: 12, idCuenta: 22 }));
  replaceMethod(prisma.cursadaEspacio as any, 'findUnique', async () => ({ id: 5, anioLectivo: year }));

  await assert.rejects(
    inscripcionEspacioService.verificar(5, 22, { rol: ROLES.ALUMNO }),
    (error: any) => error.statusCode === 409 && /no admiten autoinscripción/.test(error.message)
  );

  let writes = 0;
  replaceMethod(prisma as any, '$transaction', async (callback: any) => callback({
    $queryRaw: async () => [],
    cursadaEspacio: { findUnique: async ({ include }: any) => include
      ? { id: 5, anioLectivo: year, activo: true, espacioCurricular: { activo: true, carreraId: 9 } }
      : { id: 5, espacioCurricular: { carreraId: 9 } } },
    inscripcionEspacio: { create: async () => { writes++; return {}; } }
  }));
  await assert.rejects(
    inscripcionEspacioService.inscribir(5, undefined, 22, { id: 22, rol: ROLES.ALUMNO }),
    (error: any) => error.statusCode === 409 && /no admiten autoinscripción/.test(error.message)
  );
  assert.equal(writes, 0);
});

test('la baja conserva definitivas aprobadas y da de baja sólo componentes pendientes', async () => {
  const childUpdates: any[] = [];
  const parentUpdates: any[] = [];
  replaceMethod(estadoAcademicoService, 'getMateriasAprobadasSet', async () => new Set([21]));
  replaceMethod(inscripcionEspacioService as any, 'presentarMatricula', async (row: any) => row);
  replaceMethod(prisma as any, '$transaction', async (callback: any) => callback({
    $queryRaw: async () => [],
    inscripcionEspacio: {
      findUnique: async () => ({ id: 4, alumnoId: 12, cursadaEspacio: { espacioCurricular: { carreraId: 9 } } }),
      update: async (args: any) => { parentUpdates.push(args); return args; }
    },
    inscripcionMateria: {
      findMany: async () => [
        { id: 1, materiaId: 21, estado: 'ACTIVA' },
        { id: 2, materiaId: 22, estado: 'ACTIVA' }
      ],
      update: async (args: any) => { childUpdates.push(args); return args; }
    }
  }));
  replaceMethod(prisma.inscripcionEspacio as any, 'findUnique', async () => ({ id: 4 }));

  await inscripcionEspacioService.darBaja(4, { rol: 'ADMINISTRATIVO', id: 1 });

  assert.deepEqual(childUpdates, [
    { where: { id: 1 }, data: { estado: 'FINALIZADA', fechaBaja: null } },
    { where: { id: 2 }, data: { estado: 'BAJA', fechaBaja: childUpdates[1].data.fechaBaja } }
  ]);
  assert.ok(childUpdates[1].data.fechaBaja instanceof Date);
  assert.deepEqual(parentUpdates[0].data, { estado: 'BAJA', fechaBaja: parentUpdates[0].data.fechaBaja });
  assert.ok(parentUpdates[0].data.fechaBaja instanceof Date);
});

test('un componente dado de baja del mismo espacio es compatible para reactivar la matrícula', async () => {
  replaceMethod(prisma.inscripcionMateria as any, 'findMany', async () => [
    { id: 1, materiaId: 21, cicloLectivo: 2026, cursadaId: 31, estado: 'BAJA', fechaBaja: new Date(), modalidadElegida: 'PRESENCIAL', inscripcionEspacioId: 4 }
  ]);

  const result = await (inscripcionEspacioService as any).compatibleChildren(12, {
    anioLectivo: 2026,
    componentes: [{ id: 31, materiaId: 21, materia: { nombre: 'Componente' } }]
  }, 4);

  assert.equal(result.incompatible, undefined);
  assert.equal(result.components[0].registration.estado, 'BAJA');
});

test('reactivar una matrícula BAJA conserva definitiva previa y reactiva sólo el componente pendiente', async () => {
  const childUpdates: any[] = [];
  const parentUpdates: any[] = [];
  const offer = {
    id: 5, espacioCurricularId: 7, anioLectivo: 2026, periodo: 'ANUAL', activo: true,
    espacioCurricular: { id: 7, carreraId: 9, activo: true, materias: [{ id: 21 }, { id: 22 }] },
    componentes: [
      { id: 31, materiaId: 21, activo: true, materia: { id: 21, nombre: 'A', modalidad: 'PRESENCIAL' } },
      { id: 32, materiaId: 22, activo: true, materia: { id: 22, nombre: 'B', modalidad: 'PRESENCIAL' } }
    ]
  };
  let offerReads = 0;
  replaceMethod(inscripcionEspacioService as any, 'loadStudent', async (usuarioId: number) => ({ usuarioId, alumnoId: 12 }));
  replaceMethod(inscripcionEspacioService as any, 'academicFacts', async () => ({
    states: new Map(), approved: new Set([21]),
    correlatividades: { cumple: true, pendientes: [] }, pendientes: [], completado: false
  }));
  replaceMethod(inscripcionEspacioService as any, 'presentarMatricula', async (row: any) => row);
  replaceMethod(prisma as any, '$transaction', async (callback: any) => callback({
    $queryRaw: async () => [],
    cursadaEspacio: { findUnique: async () => ++offerReads === 1
      ? { id: 5, espacioCurricular: { carreraId: 9 } }
      : offer },
    inscripcionCarrera: { findFirst: async () => ({ id: 14 }) },
    inscripcionEspacio: {
      findUnique: async () => ({ id: 4, alumnoId: 12, estado: 'BAJA' }),
      update: async (args: any) => { parentUpdates.push(args); return { id: 4, ...args.data }; },
      create: async () => assert.fail('No debe crear una segunda matrícula padre')
    },
    inscripcionMateria: {
      findMany: async () => [
        { id: 1, materiaId: 21, cursadaId: 31, estado: 'FINALIZADA', inscripcionEspacioId: 4, modalidadElegida: 'PRESENCIAL' },
        { id: 2, materiaId: 22, cursadaId: 32, estado: 'BAJA', inscripcionEspacioId: 4, modalidadElegida: 'PRESENCIAL' }
      ],
      update: async (args: any) => { childUpdates.push(args); return args; },
      create: async () => assert.fail('No debe duplicar componentes compatibles')
    }
  }));
  replaceMethod(prisma.inscripcionEspacio as any, 'findUnique', async () => ({ id: 4 }));

  await inscripcionEspacioService.inscribir(5, undefined, 90, { id: 1, rol: 'ADMINISTRATIVO' });

  assert.equal(parentUpdates[0].where.id, 4);
  assert.equal(parentUpdates[0].data.estado, 'ACTIVA');
  assert.equal(parentUpdates[0].data.fechaBaja, null);
  assert.deepEqual(childUpdates.map(({ where, data }) => ({ id: where.id, state: data.estado, linked: data.inscripcionEspacioId })), [
    { id: 1, state: undefined, linked: 4 },
    { id: 2, state: 'ACTIVA', linked: 4 }
  ]);
  assert.ok(childUpdates[1].data.fechaBaja === null);
});
