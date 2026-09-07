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

const admin = { id: 1, rol: ROLES.ADMINISTRATIVO };

function parcial(alumnoId: number, numero = 1) {
  return {
    alumnoId,
    tipoCalificacion: 'PARCIAL',
    numero,
    nota: 7,
    fechaEvaluacion: '2026-08-20'
  };
}

function recuperatorio(alumnoId: number, parcialOriginalId: number) {
  return {
    alumnoId,
    tipoCalificacion: 'RECUPERATORIO',
    parcialOriginalId,
    nota: 5
  };
}

function configurarAlumno(idCuenta: number, idAlumno: number | null = 7) {
  replaceMethod(alumnoRepository, 'findByUsuarioIds', async () => {
    return idAlumno === null ? [] : [{ idCuenta, idAlumno }];
  });
}

function configurarInscripcion(inscripto: boolean) {
  replaceMethod(calificacionRepository, 'findInscripcionesByCursada', async (_cursadaId: number, alumnoIds: number[]) => {
    return inscripto ? alumnoIds.map(alumnoId => ({ alumnoId })) : [];
  });
}

afterEach(() => {
  while (restorations.length > 0) restorations.pop()?.();
});

test('rechaza el lote por permiso antes de consultar alumnos o escribir', async () => {
  let escrituras = 0;
  replaceMethod(calificacionRepository, 'upsertLote', async () => {
    escrituras += 1;
    return [];
  });

  await assert.rejects(
    calificacionService.cargarLote({ cursadaId: 1, calificaciones: [parcial(10)] }, { id: 10, rol: ROLES.ALUMNO }),
    (error: any) => error.statusCode === 403 && /permisos/.test(error.message)
  );
  assert.equal(escrituras, 0);
});

test('rechaza un alumno sin ficha antes de persistir', async () => {
  configurarAlumno(10, null);
  let escrituras = 0;
  replaceMethod(calificacionRepository, 'upsertLote', async () => {
    escrituras += 1;
    return [];
  });

  await assert.rejects(
    calificacionService.cargarLote({ cursadaId: 1, calificaciones: [parcial(10)] }, admin),
    /no tiene un registro de alumno asociado/
  );
  assert.equal(escrituras, 0);
});

test('rechaza un alumno no inscripto antes de validar la fila o escribir', async () => {
  configurarAlumno(10);
  configurarInscripcion(false);
  let escrituras = 0;
  replaceMethod(calificacionRepository, 'upsertLote', async () => {
    escrituras += 1;
    return [];
  });

  await assert.rejects(
    calificacionService.cargarLote({ cursadaId: 1, calificaciones: [parcial(10)] }, admin),
    /El alumno 10 no está inscripto a esta cursada/
  );
  assert.equal(escrituras, 0);
});

test('rechaza un parcial sin fecha después de verificar la inscripción', async () => {
  configurarAlumno(10);
  configurarInscripcion(true);
  let escrituras = 0;
  replaceMethod(calificacionRepository, 'upsertLote', async () => {
    escrituras += 1;
    return [];
  });

  await assert.rejects(
    calificacionService.cargarLote({
      cursadaId: 1,
      calificaciones: [{ ...parcial(10), fechaEvaluacion: undefined } as any]
    }, admin),
    /fecha de evaluacion es requerida para un PARCIAL/
  );
  assert.equal(escrituras, 0);
});

test('rechaza un recuperatorio sin parcial original antes de persistir', async () => {
  configurarAlumno(10);
  configurarInscripcion(true);
  let escrituras = 0;
  replaceMethod(calificacionRepository, 'upsertLote', async () => {
    escrituras += 1;
    return [];
  });

  await assert.rejects(
    calificacionService.cargarLote({
      cursadaId: 1,
      calificaciones: [{ alumnoId: 10, tipoCalificacion: 'RECUPERATORIO', nota: 5 } as any]
    }, admin),
    /El parcial original es requerido para un RECUPERATORIO/
  );
  assert.equal(escrituras, 0);
});

test('rechaza un recuperatorio cuyo parcial pertenece a otro alumno', async () => {
  configurarAlumno(10, 7);
  configurarInscripcion(true);
  replaceMethod(calificacionRepository, 'findParcialesByIds', async () => [
    { id: 44, cursadaId: 1, alumnoId: 99, tipoCalificacion: 'PARCIAL', numero: 2 }
  ]);
  let escrituras = 0;
  replaceMethod(calificacionRepository, 'upsertLote', async () => {
    escrituras += 1;
    return [];
  });

  await assert.rejects(
    calificacionService.cargarLote({ cursadaId: 1, calificaciones: [recuperatorio(10, 44)] }, admin),
    /El parcial seleccionado no corresponde al alumno y cursada/
  );
  assert.equal(escrituras, 0);
});

test('rechaza un recuperatorio cuyo parcial pertenece a otra cursada', async () => {
  configurarAlumno(10, 7);
  configurarInscripcion(true);
  replaceMethod(calificacionRepository, 'findParcialesByIds', async () => [
    { id: 44, cursadaId: 2, alumnoId: 7, tipoCalificacion: 'PARCIAL', numero: 2 }
  ]);
  let escrituras = 0;
  replaceMethod(calificacionRepository, 'upsertLote', async () => {
    escrituras += 1;
    return [];
  });

  await assert.rejects(
    calificacionService.cargarLote({ cursadaId: 1, calificaciones: [recuperatorio(10, 44)] }, admin),
    /El parcial seleccionado no corresponde al alumno y cursada/
  );
  assert.equal(escrituras, 0);
});

test('rechaza duplicados del lote después de validar todas las filas', async () => {
  configurarAlumno(10, 7);
  configurarInscripcion(true);
  let consultasAlumno = 0;
  replaceMethod(alumnoRepository, 'findByUsuarioIds', async () => {
    consultasAlumno += 1;
    return [{ idCuenta: 10, idAlumno: 7 }];
  });
  let escrituras = 0;
  replaceMethod(calificacionRepository, 'upsertLote', async () => {
    escrituras += 1;
    return [];
  });

  await assert.rejects(
    calificacionService.cargarLote({ cursadaId: 1, calificaciones: [parcial(10), parcial(10)] }, admin),
    /Registro duplicado en el lote: alumno 7, tipo PARCIAL N°1/
  );
  assert.equal(consultasAlumno, 1);
  assert.equal(escrituras, 0);
});

test('permite el mismo número de parcial para alumnos distintos', async () => {
  replaceMethod(alumnoRepository, 'findByUsuarioIds', async (idCuentas: number[]) => idCuentas.map(idCuenta => ({
    idCuenta,
    idAlumno: idCuenta === 10 ? 7 : 8
  })));
  configurarInscripcion(true);
  let guardadas: any[] = [];
  replaceMethod(calificacionRepository, 'upsertLote', async (_cursadaId: number, filas: any[]) => {
    guardadas = filas;
    return filas;
  });

  const resultado = await calificacionService.cargarLote({
    cursadaId: 1,
    calificaciones: [parcial(10), parcial(11)]
  }, admin);

  assert.equal(resultado.registros, 2);
  assert.deepEqual(guardadas.map(fila => [fila.idAlumno, fila.numero]), [[7, 1], [8, 1]]);
});

test('rechaza más de un recuperatorio para el mismo parcial y alumno', async () => {
  configurarAlumno(10, 7);
  configurarInscripcion(true);
  replaceMethod(calificacionRepository, 'findParcialesByIds', async () => [
    { id: 44, cursadaId: 1, alumnoId: 7, tipoCalificacion: 'PARCIAL', numero: 2 }
  ]);
  let escrituras = 0;
  replaceMethod(calificacionRepository, 'upsertLote', async () => {
    escrituras += 1;
    return [];
  });

  await assert.rejects(
    calificacionService.cargarLote({
      cursadaId: 1,
      calificaciones: [recuperatorio(10, 44), recuperatorio(10, 44)]
    }, admin),
    /Registro duplicado en el lote: alumno 7, tipo RECUPERATORIO N°2/
  );
  assert.equal(escrituras, 0);
});

test('permite recargar una misma nota mediante upsert', async () => {
  configurarAlumno(10, 7);
  configurarInscripcion(true);
  let escrituras = 0;
  replaceMethod(calificacionRepository, 'upsertLote', async (_cursadaId: number, filas: any[]) => {
    escrituras += 1;
    return filas;
  });

  const lote = { cursadaId: 1, calificaciones: [parcial(10)] };
  assert.deepEqual(await calificacionService.cargarLote(lote, admin), { registros: 1 });
  assert.deepEqual(await calificacionService.cargarLote(lote, admin), { registros: 1 });
  assert.equal(escrituras, 2);
});
