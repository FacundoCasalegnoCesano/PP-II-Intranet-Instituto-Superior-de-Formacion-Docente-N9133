import assert from 'node:assert/strict';
import { test } from 'node:test';
import materiaRepository from '../src/repositories/materiaRepository.js';
import { createsMixedCorrelationCycle } from '../src/utils/correlatividadGraph.js';

test('el grafo mixto omite correlatividades legacy suspendidas', async () => {
  let legacyWhere: any;
  const tx = {
    correlatividad: {
      findMany: async ({ where }: any) => {
        legacyWhere = where;
        return where.suspendidaPorEspacio === false
          ? []
          : [
            { materiaOrigenId: 10, materiaRequeridaId: 11, aplicaCursado: true, aplicaRendir: true },
            { materiaOrigenId: 11, materiaRequeridaId: 10, aplicaCursado: true, aplicaRendir: true }
          ];
      }
    },
    espacioCurricular: { findMany: async () => [] }
  };

  const edges = await materiaRepository.getMixedCorrelationEdges(1, tx as any);

  assert.equal(legacyWhere.suspendidaPorEspacio, false);
  assert.deepEqual(edges, []);
  assert.equal(createsMixedCorrelationCycle(edges, [
    { from: 'M:10', to: 'M:11', kind: 'LEGACY', aplicaCursado: true, aplicaRendir: true }
  ]), false);
});
