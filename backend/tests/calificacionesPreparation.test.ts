import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  prepararCargaCalificaciones,
  type PrepararCargaCalificacionesSnapshot
} from '../src/domain/academico/calificaciones.js';

function snapshot(overrides: Partial<PrepararCargaCalificacionesSnapshot> = {}) {
  return {
    alumnosPorUsuarioId: new Map([[10, 7]]),
    inscripciones: new Set([7]),
    parcialesPorId: new Map([
      [44, { id: 44, cursadaId: 1, alumnoId: 7, tipoCalificacion: 'PARCIAL', numero: 2 }]
    ]),
    ...overrides
  } satisfies PrepararCargaCalificacionesSnapshot;
}

test('prepararCargaCalificaciones normaliza una fila PARCIAL', () => {
  const resultado = prepararCargaCalificaciones({
    cursadaId: 1,
    calificaciones: [{
      alumnoId: 10,
      tipoCalificacion: 'PARCIAL',
      nota: 8,
      fechaEvaluacion: '2026-08-20'
    }]
  }, snapshot());

  assert.deepEqual(resultado, {
    ok: true,
    filas: [{
      idAlumno: 7,
      tipoCalificacion: 'PARCIAL',
      numero: 1,
      nota: 8,
      fechaEvaluacion: new Date('2026-08-20'),
      parcialOriginalId: null,
      observacion: null
    }]
  });
});

test('prepararCargaCalificaciones toma número y vínculo del parcial recuperado', () => {
  const resultado = prepararCargaCalificaciones({
    cursadaId: 1,
    calificaciones: [{
      alumnoId: 10,
      tipoCalificacion: 'RECUPERATORIO',
      parcialOriginalId: 44,
      nota: 5
    }]
  }, snapshot());

  assert.deepEqual(resultado, {
    ok: true,
    filas: [{
      idAlumno: 7,
      tipoCalificacion: 'RECUPERATORIO',
      numero: 2,
      nota: 5,
      fechaEvaluacion: null,
      parcialOriginalId: 44,
      observacion: null
    }]
  });
});

test('prepararCargaCalificaciones respeta el orden: asociación antes que inscripción', () => {
  const resultado = prepararCargaCalificaciones({
    cursadaId: 1,
    calificaciones: [{
      alumnoId: 99,
      tipoCalificacion: 'PARCIAL',
      nota: 8
    }]
  }, snapshot({ inscripciones: new Set() }));

  assert.deepEqual(resultado, {
    ok: false,
    error: { tipo: 'ALUMNO_NO_ASOCIADO', idUsuario: 99 }
  });
});

test('prepararCargaCalificaciones valida inscripción antes de fecha de parcial', () => {
  const resultado = prepararCargaCalificaciones({
    cursadaId: 1,
    calificaciones: [{
      alumnoId: 10,
      tipoCalificacion: 'PARCIAL',
      nota: 8
    }]
  }, snapshot({ inscripciones: new Set() }));

  assert.deepEqual(resultado, {
    ok: false,
    error: { tipo: 'ALUMNO_NO_INSCRIPTO', idUsuario: 10, idAlumno: 7 }
  });
});

test('prepararCargaCalificaciones rechaza un parcial recuperatorio que no corresponde', () => {
  const resultado = prepararCargaCalificaciones({
    cursadaId: 1,
    calificaciones: [{
      alumnoId: 10,
      tipoCalificacion: 'RECUPERATORIO',
      parcialOriginalId: 44,
      nota: 5
    }]
  }, snapshot({
    parcialesPorId: new Map([
      [44, { id: 44, cursadaId: 2, alumnoId: 7, tipoCalificacion: 'PARCIAL', numero: 2 }]
    ])
  }));

  assert.deepEqual(resultado, {
    ok: false,
    error: { tipo: 'PARCIAL_NO_CORRESPONDE', parcialOriginalId: 44 }
  });
});

test('prepararCargaCalificaciones detecta duplicados después de normalizar recuperatorios', () => {
  const resultado = prepararCargaCalificaciones({
    cursadaId: 1,
    calificaciones: [
      { alumnoId: 10, tipoCalificacion: 'RECUPERATORIO', parcialOriginalId: 44, nota: 5 },
      { alumnoId: 10, tipoCalificacion: 'RECUPERATORIO', parcialOriginalId: 44, nota: 8 }
    ]
  }, snapshot());

  assert.deepEqual(resultado, {
    ok: false,
    error: {
      tipo: 'DUPLICADO',
      idAlumno: 7,
      tipoCalificacion: 'RECUPERATORIO',
      numero: 2
    }
  });
});

test('prepararCargaCalificaciones permite el mismo número para alumnos diferentes', () => {
  const resultado = prepararCargaCalificaciones({
    cursadaId: 1,
    calificaciones: [
      { alumnoId: 10, tipoCalificacion: 'PARCIAL', nota: 5, fechaEvaluacion: '2026-08-20' },
      { alumnoId: 11, tipoCalificacion: 'PARCIAL', nota: 8, fechaEvaluacion: '2026-08-20' }
    ]
  }, snapshot({
    alumnosPorUsuarioId: new Map([[10, 7], [11, 8]]),
    inscripciones: new Set([7, 8])
  }));

  assert.equal(resultado.ok, true);
  if (!resultado.ok) return;
  assert.deepEqual(resultado.filas.map(fila => [fila.idAlumno, fila.numero]), [[7, 1], [8, 1]]);
});
