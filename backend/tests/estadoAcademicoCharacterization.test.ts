import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import estadoAcademicoService from '../src/services/estadoAcademicoService.js';
import cursadaRepository from '../src/repositories/cursadaRepository.js';
import materiaRepository from '../src/repositories/materiaRepository.js';
import calificacionRepository from '../src/repositories/calificacionRepository.js';
import asistenciaRepository from '../src/repositories/asistenciaRepository.js';
import alumnoRepository from '../src/repositories/alumnoRepository.js';
import { prisma } from '../src/config/prisma.js';
import { ROLES } from '../src/constants/roles.js';

type Overrides = Record<string, unknown>;

const restorations: Array<() => void> = [];

function replaceMethod<T extends object, K extends keyof T>(target: T, key: K, replacement: T[K]) {
  const original = target[key];
  target[key] = replacement;
  restorations.push(() => {
    target[key] = original;
  });
}

function materia(overrides: Overrides = {}) {
  return {
    id: 3,
    nombre: 'Materia de prueba',
    notaMinima: 6,
    notaPromocion: 8,
    asistenciaRequerida: 75,
    tpRequeridos: 75,
    esPromocionable: false,
    carreraId: 1,
    ...overrides
  };
}

function cursada(overrides: Overrides = {}) {
  return {
    id: 11,
    materiaId: 3,
    anioLectivo: new Date().getFullYear(),
    periodo: 'ANUAL',
    activo: true,
    ...overrides
  };
}

function asistencia(alumnoId: number, presentes: number, justificados = 0) {
  return Array.from({ length: 4 }, (_, index) => ({
    alumnoId,
    fecha: new Date(`2026-04-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`),
    presente: index < presentes,
    justificado: ! (index < presentes) && index - presentes < justificados
  }));
}

async function resumen(options: {
  materia?: Overrides;
  cursada?: Overrides;
  calificaciones?: Array<Overrides>;
  asistencias?: Array<Overrides>;
}) {
  const materiaActual = materia(options.materia);

  replaceMethod(cursadaRepository, 'getCursadaActivaByMateria', async () => cursada(options.cursada) as any);
  replaceMethod(materiaRepository, 'findById', async () => materiaActual as any);
  replaceMethod(calificacionRepository, 'getInscriptosActivosByCursada', async () => [
    { alumnoId: 4, alumno: { idCuenta: 104 } }
  ] as any);
  replaceMethod(calificacionRepository, 'findAllByCursadaSimple', async () => options.calificaciones ?? [] as any);
  replaceMethod(asistenciaRepository, 'findAllByCursadaSimple', async () => options.asistencias ?? [] as any);

  const resultado = await estadoAcademicoService.getResumenPorMateria(
    Number(materiaActual.id),
    { id: 1, rol: ROLES.ADMINISTRATIVO }
  );

  return resultado.alumnos[0];
}

afterEach(() => {
  while (restorations.length > 0) restorations.pop()?.();
});

test('un recuperatorio mayor reemplaza el parcial vinculado', async () => {
  const fila = await resumen({
    calificaciones: [
      { id: 1, alumnoId: 4, tipoCalificacion: 'PARCIAL', numero: 1, nota: 7 },
      { id: 2, alumnoId: 4, tipoCalificacion: 'RECUPERATORIO', numero: 1, nota: 9, parcialOriginalId: 1 }
    ],
    asistencias: asistencia(4, 4)
  });

  assert.deepEqual(fila.parcialesEfectivos, [
    { numero: 1, notaOriginal: 7, notaEfectiva: 9, recuperado: true }
  ]);
});

test('un recuperatorio menor reemplaza el parcial y un recuperatorio sin vinculo se ignora', async () => {
  const fila = await resumen({
    calificaciones: [
      { id: 1, alumnoId: 4, tipoCalificacion: 'PARCIAL', numero: 1, nota: 8 },
      { id: 2, alumnoId: 4, tipoCalificacion: 'RECUPERATORIO', numero: 1, nota: 5, parcialOriginalId: 1 },
      { id: 3, alumnoId: 4, tipoCalificacion: 'RECUPERATORIO', numero: 2, nota: 10, parcialOriginalId: null }
    ],
    asistencias: asistencia(4, 4)
  });

  assert.deepEqual(fila.parcialesEfectivos, [
    { numero: 1, notaOriginal: 8, notaEfectiva: 5, recuperado: true }
  ]);
});

test('conserva los cinco estados académicos observables', async () => {
  const casos = [
    { esperado: 'EN_CURSO', calificaciones: [], asistencias: asistencia(4, 4) },
    { esperado: 'LIBRE', calificaciones: [{ id: 1, alumnoId: 4, tipoCalificacion: 'PARCIAL', numero: 1, nota: 8 }], asistencias: asistencia(4, 1) },
    { esperado: 'REGULAR', calificaciones: [{ id: 1, alumnoId: 4, tipoCalificacion: 'PARCIAL', numero: 1, nota: 6 }], asistencias: asistencia(4, 4) },
    { esperado: 'HABILITADO_PROMOCION', materia: { esPromocionable: true }, calificaciones: [
      { id: 1, alumnoId: 4, tipoCalificacion: 'PARCIAL', numero: 1, nota: 8 },
      { id: 2, alumnoId: 4, tipoCalificacion: 'TRABAJO_PRACTICO', numero: 1, nota: 8 }
    ], asistencias: asistencia(4, 4) },
    { esperado: 'PROMOCIONADO', materia: { esPromocionable: true }, calificaciones: [
      { id: 1, alumnoId: 4, tipoCalificacion: 'PARCIAL', numero: 1, nota: 8 },
      { id: 2, alumnoId: 4, tipoCalificacion: 'TRABAJO_PRACTICO', numero: 1, nota: 8 },
      { id: 3, alumnoId: 4, tipoCalificacion: 'EXAMEN_FINAL', numero: 1, nota: 8 }
    ], asistencias: asistencia(4, 4) }
  ];

  for (const caso of casos) {
    const fila = await resumen(caso);
    assert.equal(fila.estado, caso.esperado);
  }
});

test('distingue asistencia nula, suficiente, insuficiente y flexión justificada', async () => {
  const calificaciones = [{ id: 1, alumnoId: 4, tipoCalificacion: 'PARCIAL', numero: 1, nota: 6 }];

  const sinDatos = await resumen({ calificaciones });
  const suficiente = await resumen({ calificaciones, asistencias: asistencia(4, 3) });
  const insuficiente = await resumen({ calificaciones, asistencias: asistencia(4, 2) });
  const flexion = await resumen({ calificaciones, asistencias: asistencia(4, 2, 2) });

  assert.equal(sinDatos.asistencia.porcentaje, null);
  assert.equal(sinDatos.asistencia.cumpleRegularidad, null);
  assert.equal(suficiente.estado, 'REGULAR');
  assert.equal(insuficiente.estado, 'LIBRE');
  assert.equal(flexion.estado, 'REGULAR');
  assert.equal(flexion.asistencia.cumpleRegularidad, true);
});

test('no aplica flexión de asistencia al Taller de Práctica', async () => {
  const fila = await resumen({
    materia: { tipoEspacio: 'TALLER_PRACTICA' },
    calificaciones: [{ id: 1, alumnoId: 4, tipoCalificacion: 'PARCIAL', numero: 1, nota: 6 }],
    asistencias: asistencia(4, 2, 2)
  });

  assert.equal(fila.asistencia.porcentaje, 50);
  assert.equal(fila.estado, 'LIBRE');
  assert.equal(fila.asistencia.cumpleRegularidad, false);
});

test('diferencia integradora ausente, aprobada e insuficiente', async () => {
  const base = {
    materia: { esPromocionable: true },
    calificaciones: [
      { id: 1, alumnoId: 4, tipoCalificacion: 'PARCIAL', numero: 1, nota: 8 },
      { id: 2, alumnoId: 4, tipoCalificacion: 'TRABAJO_PRACTICO', numero: 1, nota: 8 }
    ],
    asistencias: asistencia(4, 4)
  };

  const ausente = await resumen(base);
  const aprobada = await resumen({ ...base, calificaciones: [...base.calificaciones, { id: 3, alumnoId: 4, tipoCalificacion: 'EXAMEN_FINAL', numero: 1, nota: 8 }] });
  const insuficiente = await resumen({ ...base, calificaciones: [...base.calificaciones, { id: 3, alumnoId: 4, tipoCalificacion: 'EXAMEN_FINAL', numero: 1, nota: 7 }] });

  assert.equal(ausente.estado, 'HABILITADO_PROMOCION');
  assert.equal(aprobada.estado, 'PROMOCIONADO');
  assert.equal(insuficiente.estado, 'REGULAR');
});

test('la regularidad es vigente dentro del plazo y vence al superar el año límite', async () => {
  const anioActual = new Date().getFullYear();
  const vigente = await resumen({
    cursada: { anioLectivo: anioActual - 3 },
    calificaciones: [{ id: 1, alumnoId: 4, tipoCalificacion: 'PARCIAL', numero: 1, nota: 6 }],
    asistencias: asistencia(4, 4)
  });

  const vencida = await resumen({
    cursada: { anioLectivo: anioActual - 4 },
    calificaciones: [{ id: 1, alumnoId: 4, tipoCalificacion: 'PARCIAL', numero: 1, nota: 6 }],
    asistencias: asistencia(4, 4)
  });

  assert.equal(vigente.regularHasta, `${anioActual}-12-31`);
  assert.equal(vigente.regularidadVencida, false);
  assert.equal(vigente.estado, 'REGULAR');
  assert.equal(vencida.regularidadVencida, true);
  assert.equal(vencida.estado, 'LIBRE');
});

test('getEstadoAlumno conserva solo cursadas activas y tieneRegularidadVigente consulta históricas', async () => {
  replaceMethod(alumnoRepository, 'findByUsuarioId', async () => ({ idAlumno: 4 }) as any);
  replaceMethod(prisma.inscripcionMateria, 'findMany', async args => {
    if ((args as any).include?.cursada?.include?.materia) {
      return [
        { cicloLectivo: 2026, modalidadElegida: 'PRESENCIAL', cursada: { ...cursada({ activo: true }), materia: materia(), calificaciones: [], asistencias: [] } },
        { cicloLectivo: 2025, modalidadElegida: 'PRESENCIAL', cursada: { ...cursada({ activo: false }), materia: materia({ id: 4 }), calificaciones: [], asistencias: [] } }
      ] as any;
    }

    return [{ cursada: { ...cursada({ activo: false }), calificaciones: [{ id: 1, alumnoId: 4, tipoCalificacion: 'PARCIAL', numero: 1, nota: 6 }], asistencias: asistencia(4, 4) }, materia: materia({ id: 3 }) }] as any;
  });

  const estado = await estadoAcademicoService.getEstadoAlumno(104, { id: 1, rol: ROLES.ADMINISTRATIVO });
  const regularidad = await estadoAcademicoService.tieneRegularidadVigente(4, 3);

  assert.deepEqual(estado.materias.map(m => m.materia.id), [3]);
  assert.equal(regularidad, true);
});

test('getMapaEstadosPorMateria conserva el filtro actual de cursadas activas', async () => {
  replaceMethod(prisma.inscripcionMateria, 'findMany', async () => [
    { alumnoId: 4, cursada: { ...cursada({ activo: true }), materia: materia({ id: 3 }), calificaciones: [], asistencias: [] } },
    { alumnoId: 4, cursada: { ...cursada({ activo: false }), materia: materia({ id: 4 }), calificaciones: [], asistencias: [] } }
  ] as any);

  const mapa = await estadoAcademicoService.getMapaEstadosPorMateria(4);

  assert.deepEqual([...mapa.keys()], [3]);
});

test('prioriza examen final, luego homologación y luego promoción, filtrando por carrera y conservando orden', async () => {
  replaceMethod(alumnoRepository, 'findByUsuarioId', async () => ({ idAlumno: 4 }) as any);
  replaceMethod(prisma.inscripcionExamen, 'findMany', async () => [
    { notaFinal: 7, mesa: { materia: { id: 3, nombre: 'Examen', carreraId: 1 } } }
  ] as any);
  replaceMethod(prisma.homologacion, 'findMany', async () => [
    { calificacion: 9, materia: { id: 3, nombre: 'También examen', carreraId: 1 } },
    { calificacion: 6, materia: { id: 4, nombre: 'Homologada', carreraId: 2 } }
  ] as any);
  replaceMethod(prisma.inscripcionMateria, 'findMany', async () => {
    const rows = [
    { cursada: { ...cursada({ activo: true }), materiaId: 3, materia: materia({ id: 3, nombre: 'Promoción desplazada', carreraId: 1, esPromocionable: true }), calificaciones: [
      { id: 1, alumnoId: 4, tipoCalificacion: 'PARCIAL', numero: 1, nota: 8 },
      { id: 2, alumnoId: 4, tipoCalificacion: 'TRABAJO_PRACTICO', numero: 1, nota: 8 },
      { id: 3, alumnoId: 4, tipoCalificacion: 'EXAMEN_FINAL', numero: 1, nota: 8 }
    ], asistencias: asistencia(4, 4) } },
    { cursada: { ...cursada({ activo: true }), materiaId: 4, materia: materia({ id: 4, nombre: 'Promoción desplazada 2', carreraId: 2, esPromocionable: true }), calificaciones: [
      { id: 4, alumnoId: 4, tipoCalificacion: 'PARCIAL', numero: 1, nota: 8 },
      { id: 5, alumnoId: 4, tipoCalificacion: 'TRABAJO_PRACTICO', numero: 1, nota: 8 },
      { id: 6, alumnoId: 4, tipoCalificacion: 'EXAMEN_FINAL', numero: 1, nota: 8 }
    ], asistencias: asistencia(4, 4) } },
    { cursada: { ...cursada({ activo: true }), materiaId: 5, materia: materia({ id: 5, nombre: 'Promocionada', carreraId: 1, esPromocionable: true }), calificaciones: [
      { id: 7, alumnoId: 4, tipoCalificacion: 'PARCIAL', numero: 1, nota: 8 },
      { id: 8, alumnoId: 4, tipoCalificacion: 'TRABAJO_PRACTICO', numero: 1, nota: 8 },
      { id: 9, alumnoId: 4, tipoCalificacion: 'EXAMEN_FINAL', numero: 1, nota: 8 }
    ], asistencias: asistencia(4, 4) } }
    ] as any;
    return rows;
  });

  const resultado = await estadoAcademicoService.getPromedioGeneral(
    104,
    { id: 1, rol: ROLES.ADMINISTRATIVO },
    1
  );

  assert.deepEqual(resultado.materias, [
    { materiaId: 3, nombre: 'Examen', nota: 7, via: 'EXAMEN_FINAL' },
    { materiaId: 5, nombre: 'Promocionada', nota: 8, via: 'PROMOCION_DIRECTA' }
  ]);
  assert.equal(resultado.promedioGeneral, 7.5);
});
