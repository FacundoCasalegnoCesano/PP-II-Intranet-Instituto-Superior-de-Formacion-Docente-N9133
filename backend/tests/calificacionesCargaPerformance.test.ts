import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import alumnoRepository from '../src/repositories/alumnoRepository.js';
import calificacionRepository from '../src/repositories/calificacionRepository.js';
import calificacionService from '../src/services/calificacionService.js';
import { ROLES } from '../src/constants/roles.js';

const restorations: Array<() => void> = [];

function replaceMethod(target: any, key: string, replacement: any) {
  const original = target[key];
  target[key] = replacement;
  restorations.push(() => {
    target[key] = original;
  });
}

afterEach(() => {
  while (restorations.length > 0) restorations.pop()?.();
});

test('cargarLote usa una cantidad constante de consultas agrupadas y no N+1', async () => {
  let consultasAlumnosAgrupadas = 0;
  let consultasAlumnosIndividuales = 0;
  let consultasInscripcionesAgrupadas = 0;
  let consultasInscripcionesIndividuales = 0;
  let consultasParcialesAgrupadas = 0;
  let escrituras = 0;

  replaceMethod(alumnoRepository, 'findByUsuarioIds', async () => {
    consultasAlumnosAgrupadas += 1;
    return [
      { idCuenta: 10, idAlumno: 7 },
      { idCuenta: 11, idAlumno: 8 },
      { idCuenta: 12, idAlumno: 9 }
    ];
  });
  replaceMethod(alumnoRepository, 'findByUsuarioId', async () => {
    consultasAlumnosIndividuales += 1;
    return { idAlumno: 7 };
  });
  replaceMethod(calificacionRepository, 'findInscripcionesByCursada', async () => {
    consultasInscripcionesAgrupadas += 1;
    return [{ alumnoId: 7 }, { alumnoId: 8 }, { alumnoId: 9 }];
  });
  replaceMethod(calificacionRepository, 'findParcialesByIds', async () => {
    consultasParcialesAgrupadas += 1;
    return [
      { id: 44, cursadaId: 1, alumnoId: 7, tipoCalificacion: 'PARCIAL', numero: 1 },
      { id: 45, cursadaId: 1, alumnoId: 8, tipoCalificacion: 'PARCIAL', numero: 1 },
      { id: 46, cursadaId: 1, alumnoId: 9, tipoCalificacion: 'PARCIAL', numero: 1 }
    ];
  });
  replaceMethod(calificacionRepository, 'upsertLote', async (_cursadaId: number, filas: any[]) => {
    escrituras += 1;
    return filas;
  });

  const resultado = await calificacionService.cargarLote({
    cursadaId: 1,
    calificaciones: [
      { alumnoId: 10, tipoCalificacion: 'RECUPERATORIO', parcialOriginalId: 44, nota: 5 } as any,
      { alumnoId: 11, tipoCalificacion: 'RECUPERATORIO', parcialOriginalId: 45, nota: 6 } as any,
      { alumnoId: 12, tipoCalificacion: 'RECUPERATORIO', parcialOriginalId: 46, nota: 7 } as any
    ]
  }, { id: 1, rol: ROLES.ADMINISTRATIVO });

  assert.deepEqual(resultado, { registros: 3 });
  assert.equal(consultasAlumnosAgrupadas, 1);
  assert.equal(consultasAlumnosIndividuales, 0);
  assert.equal(consultasInscripcionesAgrupadas, 1);
  assert.equal(consultasInscripcionesIndividuales, 0);
  assert.equal(consultasParcialesAgrupadas, 1);
  assert.equal(escrituras, 1);
});
