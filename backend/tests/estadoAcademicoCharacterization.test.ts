import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import estadoAcademicoService from '../src/services/estadoAcademicoService.js';
import cursadaRepository from '../src/repositories/cursadaRepository.js';
import materiaRepository from '../src/repositories/materiaRepository.js';
import carreraRepository from '../src/repositories/carreraRepository.js';
import calificacionRepository from '../src/repositories/calificacionRepository.js';
import asistenciaRepository from '../src/repositories/asistenciaRepository.js';
import alumnoRepository from '../src/repositories/alumnoRepository.js';
import { prisma } from '../src/config/prisma.js';
import { ROLES } from '../src/constants/roles.js';
import { evaluarCorrelatividades } from '../src/domain/academico/correlatividades.js';

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

async function trayectoriaConHomologaciones(homologaciones: Array<Overrides>) {
  replaceMethod(alumnoRepository, 'findByUsuarioId', async () => ({ idAlumno: 101 }) as any);
  replaceMethod(carreraRepository, 'getPlanEstudio', async () => ({
    id: 1,
    nombre: 'Carrera de prueba',
    activo: true,
    duracionAnios: 4,
    materias: [materia({ id: 3, carreraId: 1, cursoId: null, curso: null })]
  }) as any);
  replaceMethod(prisma.inscripcionMateria, 'findMany', async () => []);
  replaceMethod(prisma.inscripcionExamen, 'findMany', async () => []);
  replaceMethod(prisma.homologacion, 'findMany', async () => homologaciones as any);

  return estadoAcademicoService.getTrayectoriaIntegral(
    104,
    1,
    { id: 1, rol: ROLES.ADMINISTRATIVO }
  );
}

function homologacionAcademica(overrides: Overrides = {}) {
  return {
    id: 1,
    materiaId: 3,
    tipoHomologacion: 'TOTAL',
    estado: 'APROBADA',
    calificacion: 8,
    notaExamenHomologacion: null,
    fechaHomologacion: new Date('2026-09-15T12:00:00.000Z'),
    materia: { id: 3, nombre: 'Materia homologada', carreraId: 1 },
    ...overrides
  };
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

test('usa la nota anterior de una total aprobada como definitiva', async () => {
  const resultado = await trayectoriaConHomologaciones([
    homologacionAcademica({ tipoHomologacion: 'TOTAL', calificacion: 8 })
  ]);

  assert.deepEqual(resultado.materias[0].definitiva, {
    via: 'HOMOLOGACION',
    nota: 8,
    fecha: new Date('2026-09-15T12:00:00.000Z')
  });
});

test('usa el complementario copiado de una parcial aprobada como definitiva', async () => {
  const resultado = await trayectoriaConHomologaciones([
    homologacionAcademica({
      tipoHomologacion: 'PARCIAL',
      calificacion: 7,
      notaExamenHomologacion: 7
    })
  ]);

  assert.equal(resultado.materias[0].definitiva?.via, 'HOMOLOGACION');
  assert.equal(resultado.materias[0].definitiva?.nota, 7);
});

test('ignora pendientes y rechazadas en trayectoria promedio y correlatividades', async () => {
  let trayectoriaWhere: any;
  const rows = [
    homologacionAcademica({ estado: 'PENDIENTE', calificacion: 9 }),
    homologacionAcademica({ estado: 'RECHAZADA', calificacion: 10 }),
    homologacionAcademica({ estado: 'APROBADA', calificacion: null })
  ];
  replaceMethod(alumnoRepository, 'findByUsuarioId', async () => ({ idAlumno: 101 }) as any);
  replaceMethod(carreraRepository, 'getPlanEstudio', async () => ({
    id: 1,
    nombre: 'Carrera de prueba',
    activo: true,
    duracionAnios: 4,
    materias: [materia({ id: 3, carreraId: 1, cursoId: null, curso: null })]
  }) as any);
  replaceMethod(prisma.inscripcionMateria, 'findMany', async () => []);
  replaceMethod(prisma.inscripcionExamen, 'findMany', async () => []);
  replaceMethod(prisma.homologacion, 'findMany', async (args: any) => {
    trayectoriaWhere = args.where;
    return rows.filter(row => row.estado === args.where.estado &&
      (args.where.calificacion ? row.calificacion !== null : true)) as any;
  });

  const trayectoria = await estadoAcademicoService.getTrayectoriaIntegral(
    104,
    1,
    { id: 1, rol: ROLES.ADMINISTRATIVO }
  );

  assert.deepEqual(trayectoriaWhere, {
    alumnoId: 101,
    estado: 'APROBADA',
    calificacion: { not: null },
    materia: { carreraId: 1 }
  });
  assert.equal(trayectoria.materias[0].estado, 'PENDIENTE');
  assert.equal(trayectoria.materias[0].homologacion, null);
  assert.equal(trayectoria.promedioGeneral, null);

  const aprobadasWhere: any[] = [];
  replaceMethod(prisma.inscripcionExamen, 'findMany', async () => []);
  replaceMethod(prisma.homologacion, 'findMany', async (args: any) => {
    aprobadasWhere.push(args.where);
    return rows.filter(row => row.estado === args.where.estado && row.calificacion !== null) as any;
  });
  const aprobadas = await estadoAcademicoService.getMateriasAprobadasSet(101, new Map());

  assert.deepEqual(aprobadas, new Set());
  assert.deepEqual(aprobadasWhere[0], {
    alumnoId: 101,
    estado: 'APROBADA',
    calificacion: { not: null }
  });
});

test('la decisión de correlatividad exige una homologación aprobada con nota definitiva', async () => {
  let rows: Array<{ estado: string; materiaId: number; calificacion: number | null }> = [];
  replaceMethod(prisma.inscripcionExamen, 'findMany', async () => []);
  replaceMethod(prisma.homologacion, 'findMany', async (args: any) => rows
    .filter(row => row.estado === args.where.estado &&
      (args.where.calificacion ? row.calificacion !== null : true)) as any);

  const correlatividades = [{
    materiaRequeridaId: 30,
    materiaRequerida: { id: 30, nombre: 'Materia requerida' },
    aplicaCursado: true,
    aplicaRendir: true
  }];
  const casos = [
    { fila: { estado: 'PENDIENTE', materiaId: 30, calificacion: 8 }, cumple: false },
    { fila: { estado: 'RECHAZADA', materiaId: 30, calificacion: 9 }, cumple: false },
    { fila: { estado: 'APROBADA', materiaId: 30, calificacion: null }, cumple: false },
    { fila: { estado: 'APROBADA', materiaId: 30, calificacion: 7 }, cumple: true }
  ];

  for (const caso of casos) {
    rows = [caso.fila];
    const materiasCumplidas = await estadoAcademicoService.getMateriasAprobadasSet(101, new Map());
    const decision = evaluarCorrelatividades({
      modo: 'RENDIR',
      correlatividades,
      materiasCumplidas
    });

    assert.equal(decision.cumple, caso.cumple, caso.fila.estado + ' / ' + caso.fila.calificacion);
  }
});

test('mantiene intactos parciales efectivos y recuperatorios vinculados', async () => {
  const fila = await resumen({
    calificaciones: [
      { id: 1, alumnoId: 4, tipoCalificacion: 'PARCIAL', numero: 1, nota: 6 },
      { id: 2, alumnoId: 4, tipoCalificacion: 'RECUPERATORIO', numero: 1, nota: 8, parcialOriginalId: 1 }
    ],
    asistencias: asistencia(4, 4)
  });

  assert.deepEqual(fila.parcialesEfectivos, [
    { numero: 1, notaOriginal: 6, notaEfectiva: 8, recuperado: true }
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
