import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import alumnoRepository from '../src/repositories/alumnoRepository.js';
import calificacionRepository from '../src/repositories/calificacionRepository.js';
import calificacionService from '../src/services/calificacionService.js';
import calificacionController from '../src/controllers/calificacionController.js';
import { ROLES } from '../src/constants/roles.js';
import { validationMiddleware } from '../src/middleware/validation.js';
import { cargaCalificacionesSchema, listCalificacionesQuerySchema } from '../src/validations/calificacionValidation.js';

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

test('lista parciales y recuperatorios con fecha YYYY-MM-DD sin corrimiento horario', async () => {
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

  assert.equal(resultado[0].fechaEvaluacion, '2026-08-20');
  assert.equal(resultado[1].fechaEvaluacion, '2026-08-25');
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

  assert.equal(resultado[0].fechaEvaluacion, '2026-08-30');
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

  assert.equal(resultado[0].fechaEvaluacion, '2026-09-03');
});

test('alinea los filtros numero y alumnoId público con el repository y el DTO público', async () => {
  let filtrosRecibidos: unknown;
  replaceMethod(alumnoRepository, 'findByUsuarioId', async () => ({ idAlumno: 7 }));
  replaceMethod(calificacionRepository, 'findByCursada', async (
    _cursadaId: number,
    _tipo: string | undefined,
    _alumnoId: number | undefined,
    numero: number | undefined
  ) => {
    filtrosRecibidos = { tipo: _tipo, numero, alumnoId: _alumnoId };
    return [{
      id: 1,
      cursadaId: 9,
      alumnoId: 7,
      tipoCalificacion: 'PARCIAL',
      numero: 2,
      nota: 8,
      fechaEvaluacion: new Date('2026-08-20T00:00:00.000Z'),
      alumno: {
        idAlumno: 7,
        usuario: { idUsuario: 13, apellidoNombre: 'Lucía Fernández', dni: 42666888 }
      }
    }];
  });

  const resultado = await calificacionService.getByCursada(
    9,
    { tipo: 'PARCIAL', numero: 2, alumnoId: 13 },
    { id: 1, rol: ROLES.ADMINISTRATIVO }
  );

  assert.deepEqual(filtrosRecibidos, { tipo: 'PARCIAL', numero: 2, alumnoId: 7 });
  assert.deepEqual(resultado[0].alumno, {
    alumnoId: 13,
    apellidoNombre: 'Lucía Fernández',
    dni: 42666888
  });
  assert.equal('idAlumno' in resultado[0].alumno, false);
  assert.equal(resultado[0].fechaEvaluacion, '2026-08-20');
});

test('la fecha de carga exige calendario estricto y día real', () => {
  const base = {
    cursadaId: 9,
    calificaciones: [{ alumnoId: 13, tipoCalificacion: 'PARCIAL', nota: 8 }]
  };
  for (const fechaEvaluacion of ['2026-08-20T00:00:00.000Z', '2026-8-20', '2026-02-30']) {
    const { error } = cargaCalificacionesSchema.validate({
      ...base,
      calificaciones: [{ ...base.calificaciones[0], fechaEvaluacion }]
    });
    assert.ok(error, `debe rechazar ${fechaEvaluacion}`);
  }
  assert.equal(cargaCalificacionesSchema.validate({
    ...base,
    calificaciones: [{ ...base.calificaciones[0], fechaEvaluacion: '2026-08-20' }]
  }).error, undefined);
});

test('traslada filtros validados desde Joi y controller hasta el service', async () => {
  let filtrosRecibidos: unknown;
  replaceMethod(calificacionService as any, 'getByCursada', async (_cursadaId: number, filtros: unknown) => {
    filtrosRecibidos = filtros;
    return [];
  });

  const req: any = {
    params: { cursadaId: '9' },
    query: { tipo: 'PARCIAL', numero: '2', alumnoId: '13' },
    user: { id: 1, rol: ROLES.ADMINISTRATIVO }
  };
  const res: any = { json: () => undefined };
  let controllerPromise: Promise<void> | undefined;
  validationMiddleware(listCalificacionesQuerySchema, 'query')(req, res, () => {
    controllerPromise = calificacionController.getByCursada(req, res, (error) => {
      throw error;
    });
  });
  await controllerPromise;

  assert.deepEqual(filtrosRecibidos, { tipo: 'PARCIAL', numero: 2, alumnoId: 13 });
});
