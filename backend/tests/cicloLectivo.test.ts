import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  anioInstitucionalActual,
  fechaPerteneceAlAnioLectivo
} from '../src/utils/cicloLectivo.js';

test('el año institucional usa Buenos Aires antes de cambiar de año UTC', () => {
  assert.equal(
    anioInstitucionalActual(new Date('2027-01-01T01:30:00Z')),
    2026
  );
});

test('la guarda de fecha compara el año calendario del ciclo lectivo', () => {
  assert.equal(fechaPerteneceAlAnioLectivo(new Date('2026-08-24T00:00:00.000Z'), 2026), true);
  assert.equal(fechaPerteneceAlAnioLectivo(new Date('2025-12-31T23:59:59.000Z'), 2026), false);
});
