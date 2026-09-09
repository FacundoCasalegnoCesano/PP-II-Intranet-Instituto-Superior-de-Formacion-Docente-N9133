import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  evaluarCorrelatividades,
  type CorrelatividadSnapshot
} from '../src/domain/academico/correlatividades.js';

function correlatividad(
  overrides: Partial<CorrelatividadSnapshot> = {}
): CorrelatividadSnapshot {
  return {
    materiaRequeridaId: 11,
    materiaRequerida: { id: 11, nombre: 'Didáctica' },
    aplicaCursado: true,
    aplicaRendir: true,
    ...overrides
  };
}

test('CURSAR devuelve cumplimiento cuando todas las obligatorias están satisfechas', () => {
  const resultado = evaluarCorrelatividades({
    modo: 'CURSAR',
    correlatividades: [correlatividad()],
    materiasCumplidas: new Set([11])
  });

  assert.deepEqual(resultado, {
    cumple: true,
    primerError: null,
    pendientes: []
  });
});

test('CURSAR ignora una correlativa que solo aplica al rendir', () => {
  const resultado = evaluarCorrelatividades({
    modo: 'CURSAR',
    correlatividades: [correlatividad({ aplicaCursado: false, aplicaRendir: true })],
    materiasCumplidas: new Set()
  });

  assert.deepEqual(resultado, {
    cumple: true,
    primerError: null,
    pendientes: []
  });
});

test('CURSAR devuelve el primer error tipado y conserva los pendientes en orden', () => {
  const resultado = evaluarCorrelatividades({
    modo: 'CURSAR',
    correlatividades: [
      correlatividad(),
      correlatividad({
        materiaRequeridaId: 12,
        materiaRequerida: { id: 12, nombre: 'Pedagogía' }
      })
    ],
    materiasCumplidas: new Set()
  });

  assert.equal(resultado.cumple, false);
  if (resultado.cumple) return;

  assert.deepEqual(resultado.primerError, {
    tipo: 'OBLIGATORIA_NO_CUMPLIDA',
    materiaRequeridaId: 11,
    nombreMateria: 'Didáctica'
  });
  assert.deepEqual(resultado.pendientes, [
    {
      tipo: 'MATERIA',
      materiaRequeridaId: 11,
      materiaRequerida: { id: 11, nombre: 'Didáctica' }
    },
    {
      tipo: 'MATERIA',
      materiaRequeridaId: 12,
      materiaRequerida: { id: 12, nombre: 'Pedagogía' }
    }
  ]);
});

test('RENDIR evalúa únicamente las obligatorias marcadas con aplicaRendir', () => {
  const resultado = evaluarCorrelatividades({
    modo: 'RENDIR',
    correlatividades: [
      correlatividad({
        aplicaRendir: false
      }),
      correlatividad({
        materiaRequeridaId: 12,
        materiaRequerida: { id: 12, nombre: 'Pedagogía' }
      })
    ],
    materiasCumplidas: new Set([12])
  });

  assert.equal(resultado.cumple, true);
});

test('RENDIR bloquea hasta aprobar todas las correlativas aplicables', () => {
  const resultado = evaluarCorrelatividades({
    modo: 'RENDIR',
    correlatividades: [
      correlatividad({
        materiaRequeridaId: 11,
        materiaRequerida: { id: 11, nombre: 'Didáctica' }
      }),
      correlatividad({
        materiaRequeridaId: 12,
        materiaRequerida: { id: 12, nombre: 'Pedagogía' }
      })
    ],
    materiasCumplidas: new Set([11])
  });

  assert.equal(resultado.cumple, false);
  if (resultado.cumple) return;
  assert.equal(resultado.primerError.materiaRequeridaId, 12);
});

test('MOSTRAR_DISPONIBILIDAD ignora una correlativa que solo aplica al rendir', () => {
  const resultado = evaluarCorrelatividades({
    modo: 'MOSTRAR_DISPONIBILIDAD',
    correlatividades: [correlatividad({ aplicaCursado: false, aplicaRendir: true })],
    materiasCumplidas: new Set()
  });

  assert.deepEqual(resultado, {
    cumple: true,
    primerError: null,
    pendientes: []
  });
});

test('MOSTRAR_DISPONIBILIDAD conserva orden y duplicados de obligatorias pendientes', () => {
  const resultado = evaluarCorrelatividades({
    modo: 'MOSTRAR_DISPONIBILIDAD',
    correlatividades: [
      correlatividad(),
      correlatividad(),
      correlatividad({
        materiaRequeridaId: 12,
        materiaRequerida: { id: 12, nombre: 'Pedagogía' }
      })
    ],
    materiasCumplidas: new Set()
  });

  assert.equal(resultado.cumple, false);
  if (resultado.cumple) return;

  assert.deepEqual(resultado.pendientes, [
    {
      tipo: 'MATERIA',
      materiaRequeridaId: 11,
      materiaRequerida: { id: 11, nombre: 'Didáctica' }
    },
    {
      tipo: 'MATERIA',
      materiaRequeridaId: 11,
      materiaRequerida: { id: 11, nombre: 'Didáctica' }
    },
    {
      tipo: 'MATERIA',
      materiaRequeridaId: 12,
      materiaRequerida: { id: 12, nombre: 'Pedagogía' }
    }
  ]);
});
