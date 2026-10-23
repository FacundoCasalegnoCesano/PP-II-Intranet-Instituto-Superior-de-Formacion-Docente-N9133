import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluarRequisitosAcademicos } from '../src/domain/academico/correlatividadesEspacios.js';

const reglas = [
  { tipo: 'MATERIA' as const, requisitoId: 10, nombre: 'Materia previa', materiaId: 10 },
  { tipo: 'ESPACIO' as const, requisitoId: 20, nombre: 'Espacio previo', componentesIds: [21, 22] }
];

test('para cursar acepta requisitos regularizados o aprobados, con todas las materias del espacio', () => {
  const result = evaluarRequisitosAcademicos({ modo: 'CURSAR', reglas, materiasCumplidas: new Set([10, 21, 22]) });
  assert.equal(result.cumple, true);
  assert.deepEqual(result.pendientes, []);
});

test('para rendir exige aprobar cada componente y distingue materia de espacio pendiente', () => {
  const result = evaluarRequisitosAcademicos({ modo: 'RENDIR', reglas, materiasCumplidas: new Set([10, 21]) });
  assert.equal(result.cumple, false);
  assert.deepEqual(result.pendientes, [{ tipo: 'ESPACIO', requisitoId: 20, nombre: 'Espacio previo' }]);
  assert.equal(result.primerError?.tipo, 'ESPACIO');
});
