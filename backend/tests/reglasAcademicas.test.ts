import assert from 'node:assert/strict';
import { test } from 'node:test';

import { umbralTpsRegularizar } from '../src/utils/reglasAcademicas.js';

test('materia presencial sin promoción requiere 75% de TPs aprobados', () => {
  assert.equal(umbralTpsRegularizar({
    tipoEspacio: 'MATERIA',
    modalidad: 'PRESENCIAL',
    regimen: 'REGULAR_PRESENCIAL_SIN_PROMOCION',
    tpRequeridos: 100
  }), 75);
});

test('promoción directa requiere 100% de TPs aprobados', () => {
  assert.equal(umbralTpsRegularizar({
    tipoEspacio: 'MATERIA',
    modalidad: 'PRESENCIAL',
    regimen: 'REGULAR_PRESENCIAL_PROMOCION',
    tpRequeridos: 75
  }), 100);
});

test('semipresencial, seminarios y talleres requieren 100% de TPs aprobados', () => {
  assert.equal(umbralTpsRegularizar({ modalidad: 'SEMIPRESENCIAL', tpRequeridos: 75 }), 100);
  assert.equal(umbralTpsRegularizar({ tipoEspacio: 'SEMINARIO', tpRequeridos: 75 }), 100);
  assert.equal(umbralTpsRegularizar({ tipoEspacio: 'TALLER', tpRequeridos: 75 }), 100);
  assert.equal(umbralTpsRegularizar({ tipoEspacio: 'TALLER_PRACTICA', tpRequeridos: 75 }), 100);
});
