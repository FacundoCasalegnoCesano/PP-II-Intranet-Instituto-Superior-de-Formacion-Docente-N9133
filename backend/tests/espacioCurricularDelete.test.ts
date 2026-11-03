import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { prisma } from '../src/config/prisma.js';
import materiaRepository from '../src/repositories/materiaRepository.js';
import espacioCurricularService from '../src/services/espacioCurricularService.js';

const restorations: Array<() => void> = [];

function replace(target: object, key: PropertyKey, value: unknown) {
  const record = target as Record<PropertyKey, unknown>;
  const original = record[key];
  record[key] = value;
  restorations.push(() => { record[key] = original; });
}

function setupDelete(
  counts: Record<string, number> = {},
  offers: any[] = [],
  correlations: { edges?: any[]; suspendedRules?: any[] } = {}
) {
  const events: string[] = [];
  replace(materiaRepository, 'getMixedCorrelationEdges', async () => correlations.edges ?? []);
  const db = {
    $queryRaw: async (parts: TemplateStringsArray) => { events.push(`lock:${parts[0]}`); return []; },
    espacioCurricular: {
      findUnique: async ({ select }: any) => select?.materias
        ? { id: 7, carreraId: 3, composicionBloqueadaAt: null, materias: [{ id: 10 }] }
        : { id: 7, carreraId: 3 },
      delete: async () => { events.push('space.delete'); }
    },
    inscripcionEspacio: { count: async ({ where }: any) => { events.push(`enrollment.count:${JSON.stringify(where)}`); return counts.enrollments ?? 0; } },
    inscripcionMateria: { count: async () => counts.componentEnrollments ?? 0 },
    periodoEspacioHabilitado: { count: async ({ where }: any) => { events.push(`period.count:${JSON.stringify(where)}`); return counts.periods ?? 0; } },
    alumnoEspacioCurricular: { count: async () => counts.legacyGrades ?? 0 },
    espacioCorrelatividad: {
      count: async ({ where }: any) => where.espacioOrigenId !== undefined ? counts.ownedRules ?? 0 : counts.spaceRules ?? 0,
      deleteMany: async () => { events.push('space.rules.delete'); }
    },
    correlatividad: {
      count: async () => counts.legacyRules ?? 0,
      findMany: async () => correlations.suspendedRules ?? [],
      updateMany: async () => { events.push('rules.restore'); }
    },
    cursadaEspacio: {
      findMany: async () => offers,
      deleteMany: async () => { events.push('offers.delete'); }
    },
    cursada: { updateMany: async (args: any) => { events.push(`courses.detach:${JSON.stringify(args)}`); } },
    materia: { updateMany: async () => { events.push('membership.clear'); } }
  };
  replace(prisma, '$transaction', async (operation: (tx: any) => Promise<unknown>) => operation(db) as any);
  return events;
}

afterEach(() => { while (restorations.length) restorations.pop()?.(); });

test('elimina un espacio sin referencias y limpia sólo su oferta y cursadas vacías', async () => {
  const events = setupDelete({}, [{ id: 20, componentes: [{ id: 30, _count: { inscripciones: 0, asistencias: 0, calificaciones: 0, horarios: 0 } }] }]);

  await espacioCurricularService.delete(7, { rol: 'ADMINISTRATIVO' });

  assert.ok(events.findIndex(event => event.startsWith('lock:SELECT id FROM cursadas_espacios')) < events.indexOf('offers.delete'));
  assert.ok(events.some(event => event === 'courses.detach:{"where":{"cursadaEspacioId":{"in":[20]}},"data":{"cursadaEspacioId":null}}'));
  assert.deepEqual(events.slice(-3), ['offers.delete', 'membership.clear', 'space.delete']);
});

test('bloquea por matrículas históricas y períodos asociados de cualquier estado', async () => {
  for (const counts of [{ enrollments: 1 }, { componentEnrollments: 1 }, { periods: 1 }]) {
    const events = setupDelete(counts);
    await assert.rejects(espacioCurricularService.delete(7, { rol: 'ADMINISTRATIVO' }), /No se puede eliminar el espacio/);
    assert.ok(!events.includes('space.delete'));
  }
});

test('bloquea si una cursada conserva actividad académica y exige rol administrativo', async () => {
  const events = setupDelete({}, [{ id: 20, componentes: [{ id: 30, _count: { inscripciones: 0, asistencias: 1, calificaciones: 0, horarios: 0 } }] }]);
  await assert.rejects(espacioCurricularService.delete(7, { rol: 'ADMINISTRATIVO' }), /conservan datos académicos/);
  await assert.rejects(espacioCurricularService.delete(7, { rol: 'ALUMNO' }), (error: any) => error.statusCode === 403);
  assert.ok(!events.includes('space.delete'));
});

test('elimina correlativas propias y restaura las correlativas suspendidas de sus materias', async () => {
  const events = setupDelete({ ownedRules: 1 }, [], { suspendedRules: [{
    id: 50, materiaOrigenId: 10, materiaRequeridaId: 12, espacioRequeridoId: null, aplicaCursado: true, aplicaRendir: false
  }] });

  await espacioCurricularService.delete(7, { rol: 'ADMINISTRATIVO' });

  assert.ok(events.includes('space.rules.delete'));
  assert.ok(events.includes('rules.restore'));
  assert.ok(events.includes('space.delete'));
});

test('no elimina si restaurar correlativas propias crea un ciclo', async () => {
  const events = setupDelete({}, [], {
    suspendedRules: [{ id: 50, materiaOrigenId: 10, materiaRequeridaId: 12, espacioRequeridoId: null, aplicaCursado: true, aplicaRendir: true }],
    edges: [{ from: 'M:12', to: 'M:10', kind: 'LEGACY', aplicaCursado: true, aplicaRendir: true }]
  });

  await assert.rejects(espacioCurricularService.delete(7, { rol: 'ADMINISTRATIVO' }), /restaurar sus correlatividades generaría un ciclo/);
  assert.ok(!events.includes('space.delete'));
});
