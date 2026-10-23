import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import carreraRepository from '../src/repositories/carreraRepository.js';
import materiaRepository from '../src/repositories/materiaRepository.js';
import materiaService from '../src/services/materiaService.js';

const restorations: Array<() => void> = [];

function replaceMethod<T extends object, K extends keyof T>(target: T, key: K, replacement: T[K]) {
  const original = target[key];
  target[key] = replacement;
  restorations.push(() => { target[key] = original; });
}

afterEach(() => {
  while (restorations.length > 0) restorations.pop()?.();
});

function configureUpdate(initial: { esPromocionable: boolean; notaMinima: number }) {
  const calls: string[] = [];
  const latchArgs: any[] = [];
  let currentConfig = { ...initial };
  const tx: any = {
    $queryRaw: async (strings: TemplateStringsArray) => {
      const sql = strings.join(' ');
      if (sql.includes('FROM materias')) { calls.push('materia-lock'); return [{ carreraId: 4 }]; }
      calls.push('career-lock');
      return [];
    },
    carrera: { findUnique: async () => ({ id: 4, nombre: 'Profesorado', duracionAnios: 4 }) },
    espacioCurricular: {
      findMany: async () => { calls.push('spaces-read'); return [{ id: 55, materias: [{ id: 30 }, { id: 31 }] }]; },
      updateMany: async (args: any) => { calls.push('latch'); latchArgs.push(args); return { count: 1 }; }
    },
    inscripcionMateria: {
      findMany: async (args: any) => {
        calls.push('enrollments');
        if (args.select) return [{ alumnoId: 77 }];
        return [{ alumnoId: 77, cursada: {
          id: 80, materiaId: 30, anioLectivo: 2026, periodo: 'ANUAL', activo: true,
          materia: {
            id: 30, nombre: 'Práctica A', carreraId: 4, ...currentConfig, notaPromocion: 8,
            asistenciaRequerida: 75, tpRequeridos: 100,
            modalidad: 'PRESENCIAL', regimen: 'REGULAR_PRESENCIAL_PROMOC', tipoEspacio: 'MATERIA', aniosRegularidad: 3
          },
          calificaciones: [
            { id: 1, alumnoId: 77, tipoCalificacion: 'PARCIAL', numero: 1, nota: 9, parcialOriginalId: null },
            { id: 2, alumnoId: 77, tipoCalificacion: 'TRABAJO_PRACTICO', numero: 1, nota: 10, parcialOriginalId: null },
            { id: 3, alumnoId: 77, tipoCalificacion: 'EXAMEN_FINAL', numero: 1, nota: 9, parcialOriginalId: null }
          ],
          asistencias: [{ alumnoId: 77, fecha: new Date('2026-04-01T12:00:00Z'), presente: true, justificado: false }]
        } }];
      }
    },
    inscripcionExamen: { findMany: async () => [{ alumnoId: 77, mesa: { materiaId: 31 } }] },
    homologacion: { findMany: async () => [] }
  };
  replaceMethod(materiaRepository, 'withTransaction', async (operation: any) => operation(tx));
  replaceMethod(materiaRepository, 'findById', async (id: number) => ({
    id, carreraId: 4, nombre: 'Práctica A', activo: true,
    curso: { anio: 1 }, espacioCurricularId: 55
  }) as any);
  replaceMethod(carreraRepository, 'findById', async () => ({ id: 4, nombre: 'Profesorado', duracionAnios: 4 }) as any);
  replaceMethod(materiaRepository, 'getIncidentCorrelativityEdges', async () => [] as any);
  replaceMethod(materiaRepository, 'update', async (_id: number, data: any) => {
    calls.push('materia-update');
    currentConfig = { ...currentConfig, ...data };
    return { id: 30, carreraId: 4 } as any;
  });
  return { calls, latchArgs };
}

test('captura la promoción con configuración anterior antes de deshabilitarla y fija el latch después', async () => {
  const { calls, latchArgs } = configureUpdate({ esPromocionable: true, notaMinima: 6 });

  await materiaService.updateMateria(30, { esPromocionable: false });

  assert.deepEqual(calls.slice(0, 5), ['career-lock', 'materia-lock', 'spaces-read', 'enrollments', 'enrollments']);
  assert.ok(calls.indexOf('spaces-read', calls.indexOf('materia-update')) > calls.indexOf('materia-update'));
  assert.ok(calls.indexOf('latch') > calls.indexOf('materia-update'));
  assert.equal(latchArgs.length, 1);
  assert.equal(latchArgs[0].where.id, 55);
  assert.ok(latchArgs[0].data.composicionBloqueadaAt instanceof Date);
});

test('notaMinima serializa y recalcula el latch aunque la nueva nota mínima quite elegibilidad', async () => {
  const { calls, latchArgs } = configureUpdate({ esPromocionable: true, notaMinima: 6 });

  await materiaService.updateMateria(30, { notaMinima: 10 });

  assert.equal(calls.filter(call => call === 'career-lock').length, 1);
  assert.equal(calls.filter(call => call === 'spaces-read').length, 2);
  assert.equal(latchArgs.length, 1);
  assert.equal(latchArgs[0].where.id, 55);
});
