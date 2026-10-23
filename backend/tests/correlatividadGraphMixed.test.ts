import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createsMixedCorrelationCycle,
  espacioNode,
  materiaNode,
  type AcademicRuleEdge
} from '../src/utils/correlatividadGraph.js';

test('bloquea ciclo que cruza correlativas de espacio, pertenencia y correlativas legadas', () => {
  const edges: AcademicRuleEdge[] = [
    { from: espacioNode(1), to: materiaNode(2), kind: 'SPACE' },
    { from: materiaNode(1), to: espacioNode(1), kind: 'MEMBERSHIP' }
  ];
  const legacyAddition = { from: materiaNode(2), to: materiaNode(1), kind: 'LEGACY' as const };
  assert.equal(createsMixedCorrelationCycle(edges, [legacyAddition]), true);
});

test('bloquea ciclo iniciado por correlativa de espacio que vuelve por materia legada', () => {
  const edges: AcademicRuleEdge[] = [
    { from: materiaNode(2), to: materiaNode(1), kind: 'LEGACY' },
    { from: materiaNode(1), to: espacioNode(1), kind: 'MEMBERSHIP' }
  ];
  const spaceAddition = { from: espacioNode(1), to: materiaNode(2), kind: 'SPACE' as const };
  assert.equal(createsMixedCorrelationCycle(edges, [spaceAddition]), true);
});

test('bloquea ciclos entre espacios y permite una dependencia acíclica', () => {
  const edges: AcademicRuleEdge[] = [
    { from: espacioNode(1), to: espacioNode(2), kind: 'SPACE' },
    { from: materiaNode(3), to: espacioNode(2), kind: 'MEMBERSHIP' }
  ];
  assert.equal(createsMixedCorrelationCycle(edges, [
    { from: espacioNode(2), to: espacioNode(1), kind: 'SPACE' }
  ]), true);
  assert.equal(createsMixedCorrelationCycle(edges, [
    { from: espacioNode(2), to: materiaNode(4), kind: 'SPACE' }
  ]), false);
});

test('evalúa los ciclos por modo y no combina requisitos que nunca coinciden', () => {
  const edges: AcademicRuleEdge[] = [
    { from: materiaNode(1), to: materiaNode(2), kind: 'LEGACY', aplicaCursado: true, aplicaRendir: false }
  ];
  const oppositeModeReturn = {
    from: materiaNode(2), to: materiaNode(1), kind: 'SPACE' as const,
    aplicaCursado: false, aplicaRendir: true
  };
  assert.equal(createsMixedCorrelationCycle(edges, [oppositeModeReturn]), false);
  assert.equal(createsMixedCorrelationCycle(edges, [{ ...oppositeModeReturn, aplicaCursado: true }]), true);
});
