import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { prisma } from '../src/config/prisma.js';
import cursadaEspacioService from '../src/services/cursadaEspacioService.js';

const restorations: Array<() => void> = [];
function replace(target: object, key: PropertyKey, value: unknown) {
  const record = target as Record<PropertyKey, unknown>;
  const original = record[key];
  record[key] = value;
  restorations.push(() => { record[key] = original; });
}
afterEach(() => { while (restorations.length) restorations.pop()?.(); });

test('crea una oferta completa con una materia y rechaza un espacio vacío', async () => {
  const writes: any[] = [];
  let offerReads = 0;
  const offer = {
    id: 20, espacioCurricularId: 7, anioLectivo: 2026, periodo: 'ANUAL', activo: true,
    espacioCurricular: { id: 7, nombre: 'Práctica', carrera: { id: 3, nombre: 'Profesorado' } },
    componentes: [{ id: 31, materiaId: 10, anioLectivo: 2026, periodo: 'ANUAL', docenteId: null, materia: { id: 10, nombre: 'Residencia' }, docente: null }]
  };
  replace(prisma, '$transaction', async (operation: (tx: any) => Promise<unknown>) => operation({
    $queryRaw: async () => [],
    espacioCurricular: { findUnique: async ({ select, include }: any) => select
      ? { carreraId: 3 }
      : { id: 7, activo: true, carreraId: 3, materias: [{ id: 10, nombre: 'Residencia', carreraId: 3, activo: true, periodo: 'ANUAL' }] } },
    cursada: { findUnique: async () => null, create: async (args: any) => { writes.push(args); } },
    cursadaEspacio: { create: async (args: any) => { writes.push(args); return { id: 20 }; } }
  }) as any);
  replace(prisma.cursadaEspacio as any, 'findUnique', async () => { offerReads++; return offer; });

  const result = await cursadaEspacioService.create({
    espacioCurricularId: 7, anioLectivo: 2026, componentes: [{ materiaId: 10 }]
  }, { rol: 'ADMINISTRATIVO' });

  assert.equal(result.componentes.length, 1);
  assert.equal(writes.length, 2);
  assert.equal(offerReads, 1);

  replace(prisma as any, '$transaction', async (operation: (tx: any) => Promise<unknown>) => operation({
    $queryRaw: async () => [],
    espacioCurricular: { findUnique: async ({ select }: any) => select ? { carreraId: 3 } : { id: 7, activo: true, carreraId: 3, materias: [] } }
  }) as any);
  await assert.rejects(cursadaEspacioService.create({ espacioCurricularId: 7, anioLectivo: 2026, componentes: [] }, { rol: 'ADMINISTRATIVO' }), /al menos una materia/);
});
