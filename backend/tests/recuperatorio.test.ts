import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { cargaCalificacionesSchema } from '../src/validations/calificacionValidation.js';
import calificacionService from '../src/services/calificacionService.js';
import estadoAcademicoService from '../src/services/estadoAcademicoService.js';
import alumnoRepository from '../src/repositories/alumnoRepository.js';
import calificacionRepository from '../src/repositories/calificacionRepository.js';
import cursadaRepository from '../src/repositories/cursadaRepository.js';
import materiaRepository from '../src/repositories/materiaRepository.js';
import asistenciaRepository from '../src/repositories/asistenciaRepository.js';
import { ROLES } from '../src/constants/roles.js';
import { resumirCalificaciones } from '../src/domain/academico/calificaciones.js';

const restorations: Array<() => void> = [];

function replaceMethod(target: any, key: string, replacement: any) {
  const hadOwnProperty = Object.prototype.hasOwnProperty.call(target, key);
  const original = target[key];
  target[key] = replacement;
  restorations.push(() => {
    if (hadOwnProperty) target[key] = original;
    else delete target[key];
  });
}

afterEach(() => {
  while (restorations.length > 0) restorations.pop()?.();
});

test('un parcial nuevo exige fecha de evaluacion', () => {
  const { error } = cargaCalificacionesSchema.validate({
    cursadaId: 1,
    calificaciones: [{ alumnoId: 10, tipoCalificacion: 'PARCIAL', numero: 1, nota: 7 }]
  });
  assert.match(error?.message ?? '', /fecha/i);
});

test('un recuperatorio exige parcial original pero no observacion', () => {
  const sinParcial = cargaCalificacionesSchema.validate({
    cursadaId: 1,
    calificaciones: [{ alumnoId: 10, tipoCalificacion: 'RECUPERATORIO', nota: 8 }]
  });
  assert.match(sinParcial.error?.message ?? '', /parcial/i);

  const completa = cargaCalificacionesSchema.validate({
    cursadaId: 1,
    calificaciones: [{ alumnoId: 10, tipoCalificacion: 'RECUPERATORIO', parcialOriginalId: 44, nota: 8 }]
  });
  assert.equal(completa.error, undefined);
});

test('el recuperatorio toma numero y vinculo del parcial seleccionado', async () => {
  replaceMethod(alumnoRepository, 'findByUsuarioIds', async () => ([{ idCuenta: 10, idAlumno: 7 }]));
  replaceMethod(calificacionRepository, 'findInscripcionesByCursada', async (_cursadaId: number, alumnoIds: number[]) => alumnoIds.map(alumnoId => ({ alumnoId })));
  const parcial = { id: 44, cursadaId: 1, alumnoId: 7, tipoCalificacion: 'PARCIAL', numero: 2 };
  replaceMethod(calificacionRepository, 'findParcialById', async () => parcial);
  replaceMethod(calificacionRepository, 'findParcialesByIds', async () => [parcial]);
  let filasGuardadas: any[] = [];
  replaceMethod(calificacionRepository, 'upsertLote', async (_cursadaId: number, filas: any[]) => {
    filasGuardadas = filas;
    return filas.map((fila, index) => ({ id: index + 1, ...fila }));
  });

  await calificacionService.cargarLote({
    cursadaId: 1,
    calificaciones: [{
      alumnoId: 10,
      tipoCalificacion: 'RECUPERATORIO',
      parcialOriginalId: 44,
      nota: 8
    } as any]
  }, { id: 1, rol: ROLES.ADMINISTRATIVO });

  assert.equal(filasGuardadas[0]?.numero, 2);
  assert.equal(filasGuardadas[0]?.parcialOriginalId, 44);
  assert.equal(filasGuardadas[0]?.observacion, null);
});

test('rechaza un parcial original de otro alumno', async () => {
  replaceMethod(alumnoRepository, 'findByUsuarioIds', async () => ([{ idCuenta: 10, idAlumno: 7 }]));
  replaceMethod(calificacionRepository, 'findInscripcionesByCursada', async (_cursadaId: number, alumnoIds: number[]) => alumnoIds.map(alumnoId => ({ alumnoId })));
  const parcial = { id: 44, cursadaId: 1, alumnoId: 99, tipoCalificacion: 'PARCIAL', numero: 2 };
  replaceMethod(calificacionRepository, 'findParcialById', async () => parcial);
  replaceMethod(calificacionRepository, 'findParcialesByIds', async () => [parcial]);
  replaceMethod(calificacionRepository, 'upsertLote', async () => []);

  await assert.rejects(
    calificacionService.cargarLote({
      cursadaId: 1,
      calificaciones: [{
        alumnoId: 10,
        tipoCalificacion: 'RECUPERATORIO',
        parcialOriginalId: 44,
        nota: 8
      } as any]
    }, { id: 1, rol: ROLES.ADMINISTRATIVO }),
    /no corresponde al alumno y cursada/
  );
});

test('valida los parciales recuperados con una sola consulta', async () => {
  replaceMethod(alumnoRepository, 'findByUsuarioIds', async (idCuentas: number[]) => idCuentas.map(idCuenta => ({
    idCuenta,
    idAlumno: idCuenta === 10 ? 7 : 8
  })));
  replaceMethod(calificacionRepository, 'findInscripcionesByCursada', async (_cursadaId: number, alumnoIds: number[]) => alumnoIds.map(alumnoId => ({ alumnoId })));
  const parciales = [
    { id: 44, cursadaId: 1, alumnoId: 7, tipoCalificacion: 'PARCIAL', numero: 1 },
    { id: 45, cursadaId: 1, alumnoId: 8, tipoCalificacion: 'PARCIAL', numero: 1 }
  ];
  let consultasIndividuales = 0;
  let consultasAgrupadas = 0;
  replaceMethod(calificacionRepository, 'findParcialById', async (id: number) => {
    consultasIndividuales += 1;
    return parciales.find(parcial => parcial.id === id);
  });
  replaceMethod(calificacionRepository, 'findParcialesByIds', async () => {
    consultasAgrupadas += 1;
    return parciales;
  });
  replaceMethod(calificacionRepository, 'upsertLote', async (_cursadaId: number, filas: any[]) => filas);

  await calificacionService.cargarLote({
    cursadaId: 1,
    calificaciones: [
      { alumnoId: 10, tipoCalificacion: 'RECUPERATORIO', parcialOriginalId: 44, nota: 8 } as any,
      { alumnoId: 11, tipoCalificacion: 'RECUPERATORIO', parcialOriginalId: 45, nota: 9 } as any
    ]
  }, { id: 1, rol: ROLES.ADMINISTRATIVO });

  assert.equal(consultasAgrupadas, 1);
  assert.equal(consultasIndividuales, 0);
});

async function obtenerEstado(notaParcial: number, notaRecuperatorio: number) {
  replaceMethod(cursadaRepository, 'getCursadaActivaByMateria', async () => ({
    id: 1, materiaId: 3, anioLectivo: new Date().getFullYear(), periodo: 'ANUAL', activo: true
  }));
  replaceMethod(materiaRepository, 'findById', async () => ({
    id: 3,
    nombre: 'Materia promocionable',
    notaMinima: 6,
    notaPromocion: 8,
    asistenciaRequerida: 75,
    tpRequeridos: 100,
    esPromocionable: true,
    modalidad: 'PRESENCIAL',
    regimen: 'REGULAR_PRESENCIAL_PROMOCION',
    tipoEspacio: 'MATERIA'
  }));
  replaceMethod(calificacionRepository, 'getInscriptosActivosByCursada', async () => ([
    { alumnoId: 7, alumno: { idCuenta: 10 } }
  ]));
  replaceMethod(calificacionRepository, 'findAllByCursadaSimple', async () => ([
    { id: 44, alumnoId: 7, tipoCalificacion: 'PARCIAL', numero: 1, nota: notaParcial, parcialOriginalId: null },
    { id: 45, alumnoId: 7, tipoCalificacion: 'RECUPERATORIO', numero: 99, nota: notaRecuperatorio, parcialOriginalId: 44 },
    { id: 46, alumnoId: 7, tipoCalificacion: 'TRABAJO_PRACTICO', numero: 1, nota: 10, parcialOriginalId: null }
  ]));
  replaceMethod(asistenciaRepository, 'findAllByCursadaSimple', async () => []);

  const resultado = await estadoAcademicoService.getResumenPorMateria(
    3,
    { id: 1, rol: ROLES.ADMINISTRATIVO }
  );
  return resultado.alumnos[0]!;
}

test('un recuperatorio con 8 habilita promocion aunque el parcial tuviera 7', async () => {
  const resultado = await obtenerEstado(7, 8);
  assert.equal(resultado.estado, 'HABILITADO_PROMOCION');
  assert.equal(resultado.parcialesEfectivos[0]?.notaEfectiva, 8);
});

test('un recuperatorio menor a 8 elimina promocion aunque el parcial tuviera 9', async () => {
  const resultado = await obtenerEstado(9, 7);
  assert.equal(resultado.estado, 'REGULAR');
  assert.equal(resultado.parcialesEfectivos[0]?.notaEfectiva, 7);
});

test('un recuperatorio sin vinculo no reemplaza un parcial por coincidencia de numero', () => {
  const resultado = resumirCalificaciones({
    calificaciones: [
      { id: 44, alumnoId: 4, tipoCalificacion: 'PARCIAL', numero: 1, nota: 9 },
      { id: 45, alumnoId: 4, tipoCalificacion: 'RECUPERATORIO', numero: 1, nota: 6, parcialOriginalId: null }
    ],
    notaMinima: 6,
    tpRequeridos: 75
  }).parcialesEfectivos;

  assert.deepEqual(resultado, [{
    numero: 1,
    notaOriginal: 9,
    notaEfectiva: 9,
    recuperado: false
  }]);
});
