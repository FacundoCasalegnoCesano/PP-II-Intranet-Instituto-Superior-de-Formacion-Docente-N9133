import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import alumnoRepository from '../src/repositories/alumnoRepository.js';
import calificacionRepository from '../src/repositories/calificacionRepository.js';
import calificacionService from '../src/services/calificacionService.js';
import { ROLES } from '../src/constants/roles.js';

const restorations: Array<() => void> = [];

function replaceMethod(target: Record<string, unknown>, key: string, replacement: unknown) {
  const original = target[key];
  target[key] = replacement;
  restorations.push(() => {
    target[key] = original;
  });
}

afterEach(() => {
  while (restorations.length > 0) restorations.pop()?.();
});

test('lista parciales y recuperatorios con fecha DD/MM/YYYY sin corrimiento horario', async () => {
  replaceMethod(calificacionRepository, 'findByCursada', async () => [
    {
      id: 1,
      cursadaId: 9,
      alumnoId: 7,
      tipoCalificacion: 'PARCIAL',
      numero: 1,
      nota: 8,
      fechaEvaluacion: new Date('2026-08-20T00:00:00.000Z')
    },
    {
      id: 2,
      cursadaId: 9,
      alumnoId: 7,
      tipoCalificacion: 'RECUPERATORIO',
      numero: 1,
      nota: 9,
      fechaEvaluacion: new Date('2026-08-25T00:00:00.000Z'),
      parcialOriginalId: 1
    }
  ]);

  const resultado = await calificacionService.getByCursada(
    9,
    {},
    { id: 1, rol: ROLES.ADMINISTRATIVO }
  );

  assert.equal(resultado[0].fechaEvaluacion, '20/08/2026');
  assert.equal(resultado[1].fechaEvaluacion, '25/08/2026');
});

test('mantiene fechas de otros tipos sin aplicar el formato de parcial', async () => {
  const fechaExamen = new Date('2026-08-30T15:30:00.000Z');
  replaceMethod(calificacionRepository, 'findByCursada', async () => [
    {
      id: 3,
      cursadaId: 9,
      alumnoId: 7,
      tipoCalificacion: 'EXAMEN_FINAL',
      numero: 1,
      nota: 8,
      fechaEvaluacion: fechaExamen
    }
  ]);

  const resultado = await calificacionService.getByCursada(
    9,
    {},
    { id: 1, rol: ROLES.ADMINISTRATIVO }
  );

  assert.equal(resultado[0].fechaEvaluacion, fechaExamen);
});

test('el historial del alumno también devuelve la fecha del parcial sin hora', async () => {
  replaceMethod(alumnoRepository, 'findByUsuarioId', async () => ({ idAlumno: 7 }));
  replaceMethod(calificacionRepository, 'findByAlumno', async () => [
    {
      id: 4,
      cursadaId: 9,
      alumnoId: 7,
      tipoCalificacion: 'PARCIAL',
      numero: 2,
      nota: 6,
      fechaEvaluacion: new Date('2026-09-03T00:00:00.000Z')
    }
  ]);

  const resultado = await calificacionService.getByAlumno(
    10,
    { id: 1, rol: ROLES.ADMINISTRATIVO }
  );

  assert.equal(resultado[0].fechaEvaluacion, '03/09/2026');
});
