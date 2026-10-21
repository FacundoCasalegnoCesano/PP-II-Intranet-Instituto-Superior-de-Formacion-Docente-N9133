import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluarEspacios, resumirUnidadesAcademicas } from '../src/domain/academico/espaciosAcademicos.js';

const materias = [
  { materia: { id: 1, nombre: 'Didáctica I' }, estado: 'APROBADA', definitiva: { nota: 7, via: 'EXAMEN_FINAL' } },
  { materia: { id: 2, nombre: 'Didáctica II' }, estado: 'HOMOLOGADA', definitiva: { nota: 8, via: 'HOMOLOGACION' } },
  { materia: { id: 3, nombre: 'Práctica I' }, estado: 'PROMOCIONADO', definitiva: { nota: 8, via: 'PROMOCION_DIRECTA' } },
  { materia: { id: 4, nombre: 'Historia' }, estado: 'APROBADA', definitiva: { nota: 6, via: 'EXAMEN_FINAL' } },
  { materia: { id: 5, nombre: 'Práctica II' }, estado: 'APROBADA', definitiva: { nota: 8, via: 'HOMOLOGACION' } },
  { materia: { id: 6, nombre: 'Práctica III' }, estado: 'APROBADA', definitiva: { nota: 8, via: 'EXAMEN_FINAL' } }
];

test('aprueba espacios de dos y tres componentes con promedio simple redondeado .5 hacia arriba', () => {
  const espacios = evaluarEspacios([
    { id: 11, nombre: 'Didáctica', materias: [{ id: 1, nombre: 'Didáctica I' }, { id: 2, nombre: 'Didáctica II' }] },
    { id: 12, nombre: 'Práctica', materias: [{ id: 3, nombre: 'Práctica I' }, { id: 5, nombre: 'Práctica II' }, { id: 6, nombre: 'Práctica III' }] }
  ], materias);

  assert.equal(espacios[0].nota, 8);
  assert.equal(espacios[1].nota, 8);
  assert.equal(espacios[0].estado, 'APROBADA');
});

test('no calcula promedio parcial cuando falta aprobación o nota definitiva', () => {
  const resultado = evaluarEspacios([
    { id: 13, nombre: 'Incompleto', materias: [{ id: 1, nombre: 'Didáctica I' }, { id: 99, nombre: 'Pendiente' }] }
  ], materias);

  assert.equal(resultado[0].estado, 'PENDIENTE');
  assert.equal(resultado[0].nota, null);
});

test('promedia un espacio aprobado una vez, excluye sus componentes y conserva materias sueltas', () => {
  const espacios = evaluarEspacios([
    { id: 11, nombre: 'Didáctica', materias: [{ id: 1, nombre: 'Didáctica I' }, { id: 2, nombre: 'Didáctica II' }] }
  ], materias);
  const resumen = resumirUnidadesAcademicas(materias, espacios);

  assert.deepEqual(resumen, { promedio: 7.6, aprobadas: 5, total: 5 });
});
