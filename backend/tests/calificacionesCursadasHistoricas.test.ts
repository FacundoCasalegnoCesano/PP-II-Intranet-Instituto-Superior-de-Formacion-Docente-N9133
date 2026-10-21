import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { prisma } from '../src/config/prisma.js';
import cursadaRepository from '../src/repositories/cursadaRepository.js';

const restorations: Array<() => void> = [];

function replaceMethod(target: Record<string, unknown>, key: string, replacement: unknown) {
  const original = target[key];
  target[key] = replacement;
  restorations.push(() => { target[key] = original; });
}

afterEach(() => { while (restorations.length) restorations.pop()?.(); });

test('calificaciones administrativas incluye cursadas activas e inactivas del ciclo exacto', async () => {
  let query: any;
  replaceMethod((prisma as any).cursada, 'findMany', async (args: any) => {
    query = args;
    return [
      { id: 4, anioLectivo: 2001, materia: { id: 7, nombre: 'Historia', carrera: { id: 2, nombre: 'Inicial' } } },
      { id: 5, anioLectivo: 2001, materia: { id: 8, nombre: 'Pedagogía', carrera: { id: 3, nombre: 'Primaria' } } }
    ];
  });

  const available = await cursadaRepository.findDisponiblesParaCalificaciones({ anioLectivo: 2001 });

  assert.deepEqual(query.where, { anioLectivo: 2001 });
  assert.deepEqual(query.select.materia.select, {
    id: true,
    nombre: true,
    carrera: { select: { id: true, nombre: true } }
  });
  assert.deepEqual(available.map(row => row.cursadaId), [4, 5]);
  assert.deepEqual(available.map(row => row.materia.carrera.id), [2, 3]);
});

test('calificaciones de profesor conserva el filtro de activas y asignación', async () => {
  let query: any;
  replaceMethod((prisma as any).cursada, 'findMany', async (args: any) => { query = args; return []; });

  await cursadaRepository.findDisponiblesParaCalificaciones({ anioLectivo: 2026, profesorId: 18 });

  assert.equal(query.where.activo, true);
  assert.equal(query.where.anioLectivo, 2026);
  assert.equal(query.where.OR[0].docenteId, 18);
  assert.equal(query.where.OR[1].materia.profesorMaterias.some.profesorId, 18);
});
