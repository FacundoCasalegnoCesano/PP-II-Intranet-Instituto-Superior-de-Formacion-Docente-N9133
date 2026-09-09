import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import asistenciaRepository from '../src/repositories/asistenciaRepository.js';
import alumnoRepository from '../src/repositories/alumnoRepository.js';
import cursadaRepository from '../src/repositories/cursadaRepository.js';
import type { InscriptoPublico } from '../src/repositories/cursadaRepository.js';
import profesorMateriaRepository from '../src/repositories/profesorMateriaRepository.js';
import { prisma } from '../src/config/prisma.js';
import asistenciaService from '../src/services/asistenciaService.js';
import calificacionService from '../src/services/calificacionService.js';
import cursadaService from '../src/services/cursadaService.js';
import { ROLES } from '../src/constants/roles.js';
import { anioInstitucionalActual } from '../src/utils/cicloLectivo.js';
import { verificarPermisoMutacionCursada } from '../src/utils/docenteHelper.js';

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

test('rechaza que un profesor mute una cursada histórica', async () => {
  replaceMethod(cursadaRepository, 'findById', async () => ({
    id: 8,
    materiaId: 3,
    docenteId: 12,
    activo: true,
    anioLectivo: 2025
  }));

  await assert.rejects(
    verificarPermisoMutacionCursada(
      { id: 12, rol: ROLES.PROFESOR },
      8,
      new Date('2026-06-15T12:00:00Z')
    ),
    (error: any) => error.statusCode === 403
  );
});

test('acepta ProfesorMateria activa sin baja para una cursada actual', async () => {
  const evaluadoEn = new Date('2026-06-15T12:00:00Z');
  let consultasAsignacion = 0;
  replaceMethod(cursadaRepository, 'findById', async () => ({
    id: 8,
    materiaId: 3,
    docenteId: null,
    activo: true,
    anioLectivo: anioInstitucionalActual(evaluadoEn)
  }));
  replaceMethod(profesorMateriaRepository, 'findByProfesorAndMateria', async () => {
    consultasAsignacion += 1;
    return { profesorId: 12, materiaId: 3, activo: true, fechaBaja: null };
  });

  await assert.doesNotReject(
    verificarPermisoMutacionCursada(
      { id: 12, rol: ROLES.PROFESOR },
      8,
      evaluadoEn
    )
  );
  assert.equal(consultasAsignacion, 1);
});

test('rechaza ProfesorMateria inactiva aunque la cursada sea actual', async () => {
  replaceMethod(cursadaRepository, 'findById', async () => ({
    id: 8,
    materiaId: 3,
    docenteId: null,
    activo: true,
    anioLectivo: 2026
  }));
  replaceMethod(profesorMateriaRepository, 'findByProfesorAndMateria', async () => ({
    profesorId: 12,
    materiaId: 3,
    activo: false,
    fechaBaja: null
  }));

  await assert.rejects(
    verificarPermisoMutacionCursada(
      { id: 12, rol: ROLES.PROFESOR },
      8,
      new Date('2026-06-15T12:00:00Z')
    ),
    (error: any) => error.statusCode === 403
  );
});

test('rechaza ProfesorMateria con fechaBaja aunque figure activa', async () => {
  replaceMethod(cursadaRepository, 'findById', async () => ({
    id: 8,
    materiaId: 3,
    docenteId: null,
    activo: true,
    anioLectivo: 2026
  }));
  replaceMethod(profesorMateriaRepository, 'findByProfesorAndMateria', async () => ({
    profesorId: 12,
    materiaId: 3,
    activo: true,
    fechaBaja: new Date('2026-05-01T00:00:00Z')
  }));

  await assert.rejects(
    verificarPermisoMutacionCursada(
      { id: 12, rol: ROLES.PROFESOR },
      8,
      new Date('2026-06-15T12:00:00Z')
    ),
    (error: any) => error.statusCode === 403
  );
});

test('rechaza ProfesorMateria para una cursada inactiva aunque la asignación sea válida', async () => {
  replaceMethod(cursadaRepository, 'findById', async () => ({
    id: 8,
    materiaId: 3,
    docenteId: null,
    activo: false,
    anioLectivo: 2026
  }));
  replaceMethod(profesorMateriaRepository, 'findByProfesorAndMateria', async () => ({
    profesorId: 12,
    materiaId: 3,
    activo: true,
    fechaBaja: null
  }));

  await assert.rejects(
    verificarPermisoMutacionCursada(
      { id: 12, rol: ROLES.PROFESOR },
      8,
      new Date('2026-06-15T12:00:00Z')
    ),
    (error: any) => error.statusCode === 403
  );
});

test('admin conserva la mutación histórica', async () => {
  await assert.doesNotReject(
    verificarPermisoMutacionCursada(
      { id: 1, rol: ROLES.ADMINISTRATIVO },
      8,
      new Date('2026-06-15T12:00:00Z')
    )
  );
});

test('GET cursadas calcula editable con el año institucional y conserva paginación', async () => {
  const anio = anioInstitucionalActual();
  replaceMethod(cursadaRepository, 'findAllForProfesor', async () => ({
    data: [
      { id: 1, docenteId: 12, activo: true, anioLectivo: anio, materia: {} },
      { id: 2, docenteId: 12, activo: true, anioLectivo: anio - 1, materia: {} },
      {
        id: 3,
        docenteId: 99,
        activo: true,
        anioLectivo: anio,
        materia: {
          profesorMaterias: [{ profesorId: 12, activo: true, fechaBaja: null }]
        }
      }
    ],
    pagination: { page: 2, limit: 10, total: 2, totalPages: 1 }
  }));

  const result = await cursadaService.getCursadas(
    { page: 2, limit: 10, anioLectivo: anio + 1 },
    { id: 12, rol: ROLES.PROFESOR }
  );

  assert.deepEqual(result.pagination, { page: 2, limit: 10, total: 2, totalPages: 1 });
  assert.deepEqual(result.data.map((cursada: any) => cursada.editable), [true, false, true]);
});

test('cursadaRepository.findAll preserva filtros, restricción docente y página real', async () => {
  const anio = anioInstitucionalActual();
  let findManyCalls = 0;
  let countCalls = 0;
  let findManyArgs: any;
  let countArgs: any;
  replaceMethod((prisma as any).cursada, 'findMany', async (args: any) => {
    findManyCalls += 1;
    findManyArgs = args;
    return [{
      id: 31,
      materiaId: 3,
      docenteId: 99,
      activo: true,
      anioLectivo: anio,
      materia: {
        id: 3,
        nombre: 'Didáctica',
        carrera: { id: 1, nombre: 'Profesorado' },
        profesorMaterias: [{ profesorId: 12, activo: true, fechaBaja: null }]
      },
      docente: null,
      horarios: [],
      _count: { inscripciones: 1, asistencias: 2, calificaciones: 3 }
    }];
  });
  replaceMethod((prisma as any).cursada, 'count', async (args: any) => {
    countCalls += 1;
    countArgs = args;
    return 1;
  });

  const result = await cursadaRepository.findAll({
    page: 2,
    limit: 5,
    anioLectivo: anio,
    materiaId: 3,
    docenteId: 999,
    profesorId: 12,
    activo: true
  });

  assert.equal(findManyCalls, 1);
  assert.equal(countCalls, 1);
  assert.deepEqual(findManyArgs.where, {
    anioLectivo: anio,
    materiaId: 3,
    docenteId: 999,
    activo: true,
    OR: [
      { docenteId: 12 },
      {
        materia: {
          profesorMaterias: {
            some: { profesorId: 12, activo: true, fechaBaja: null }
          }
        }
      }
    ]
  });
  assert.deepEqual(countArgs, { where: findManyArgs.where });
  assert.equal(findManyArgs.skip, 5);
  assert.equal(findManyArgs.take, 5);
  assert.deepEqual(findManyArgs.orderBy, [
    { anioLectivo: 'desc' },
    { materia: { nombre: 'asc' } },
    { id: 'asc' }
  ]);
  assert.deepEqual(findManyArgs.include.materia.include.profesorMaterias, {
    where: { profesorId: 12, activo: true, fechaBaja: null },
    select: { profesorId: true, activo: true, fechaBaja: true }
  });
  assert.deepEqual(result.pagination, { page: 2, limit: 5, total: 1, totalPages: 1 });
});

test('GET cursadas calcula editable sobre el resultado paginado sin N+1', async () => {
  const anio = anioInstitucionalActual();
  let findManyCalls = 0;
  let countCalls = 0;
  replaceMethod((prisma as any).cursada, 'findMany', async () => {
    findManyCalls += 1;
    return [{
      id: 31,
      materiaId: 3,
      docenteId: 99,
      activo: true,
      anioLectivo: anio,
      materia: {
        id: 3,
        nombre: 'Didáctica',
        carrera: { id: 1, nombre: 'Profesorado' },
        profesorMaterias: [{ profesorId: 12, activo: true, fechaBaja: null }]
      },
      docente: null,
      horarios: [],
      _count: { inscripciones: 1, asistencias: 2, calificaciones: 3 }
    }];
  });
  replaceMethod((prisma as any).cursada, 'count', async () => {
    countCalls += 1;
    return 1;
  });

  const result = await cursadaService.getCursadas(
    { page: 2, limit: 5, anioLectivo: anio },
    { id: 12, rol: ROLES.PROFESOR }
  );

  assert.equal(findManyCalls, 1);
  assert.equal(countCalls, 1);
  assert.equal(result.data[0].editable, true);
  assert.equal('profesorMaterias' in result.data[0].materia, false);
});

test('GET cursada por ID proyecta un DTO público sin relaciones académicas internas', async () => {
  const horario = {
    id: 7,
    cursadaId: 8,
    dia: 'LUNES',
    horaInicio: new Date('1970-01-01T08:00:00.000Z'),
    horaFin: new Date('1970-01-01T10:00:00.000Z'),
    aula: 'Aula 1',
    activo: true
  };
  replaceMethod(cursadaRepository, 'findById', async () => ({
    id: 8,
    materiaId: 3,
    anioLectivo: anioInstitucionalActual(),
    periodo: 'ANUAL',
    docenteId: 12,
    activo: true,
    materia: {
      id: 3,
      nombre: 'Didáctica',
      carreraId: 1,
      esPromocionable: true,
      notaMinima: 6,
      carrera: { id: 1, nombre: 'Profesorado', duracionAnios: 4, activo: true },
      profesorMaterias: [{ profesorId: 12, activo: true, fechaBaja: null }]
    },
    docente: { idUsuario: 12, apellidoNombre: 'Ada Lovelace', email: 'ada@example.test' },
    horarios: [horario],
    inscripciones: [{ alumnoId: 600 }],
    asistencias: [{ alumnoId: 600 }],
    calificaciones: [{ alumnoId: 600 }]
  }));

  const result = await cursadaService.getCursadaById(8, { id: 12, rol: ROLES.PROFESOR });

  assert.equal(result.id, 8);
  assert.equal(result.materiaId, 3);
  assert.deepEqual(result.materia, {
    id: 3,
    nombre: 'Didáctica',
    carreraId: 1,
    esPromocionable: true,
    notaMinima: 6,
    carrera: { id: 1, nombre: 'Profesorado', duracionAnios: 4, activo: true }
  });
  assert.deepEqual(result.horarios, [horario]);
  assert.equal(result.editable, true);
  assert.equal(result.inscripciones, undefined);
  assert.equal(result.asistencias, undefined);
  assert.equal(result.calificaciones, undefined);
  assert.equal(result.materia.profesorMaterias, undefined);
  assert.equal(result.inscripciones?.[0]?.alumnoId, undefined);
});

test('GET inscriptos expone solamente la identidad pública del usuario', async () => {
  replaceMethod(cursadaRepository, 'findById', async () => ({
    id: 8,
    materiaId: 3,
    docenteId: 12,
    activo: true,
    anioLectivo: anioInstitucionalActual()
  }));
  replaceMethod(cursadaRepository, 'findInscriptosByCursadaId', async () => [
    { alumnoId: 42, apellidoNombre: 'Ada Lovelace', dni: 123, email: 'ada@example.test' }
  ]);

  const result = await cursadaService.getInscriptosByCursada(
    8,
    { id: 1, rol: ROLES.ADMINISTRATIVO }
  );

  const esperado: InscriptoPublico[] = [{
    alumnoId: 42,
    apellidoNombre: 'Ada Lovelace',
    dni: 123,
    email: 'ada@example.test'
  }];
  assert.deepEqual(result, esperado);
  assert.equal('idAlumno' in result[0], false);
  assert.equal('alumno' in result[0], false);
});

test('el repository proyecta inscriptos sin seleccionar idAlumno ni relaciones Prisma completas', async () => {
  let consulta: any;
  replaceMethod((prisma as any).inscripcionMateria, 'findMany', async (args: any) => {
    consulta = args;
    return [{
      alumno: {
        usuario: {
          idUsuario: 42,
          apellidoNombre: 'Ada Lovelace',
          dni: 123,
          email: 'ada@example.test'
        }
      }
    }];
  });

  const result = await cursadaRepository.findInscriptosByCursadaId(8);

  assert.deepEqual(consulta.select, {
    alumno: {
      select: {
        usuario: {
          select: {
            idUsuario: true,
            apellidoNombre: true,
            dni: true,
            email: true
          }
        }
      }
    }
  });
  assert.equal('include' in consulta, false);
  assert.deepEqual(result, [{
    alumnoId: 42,
    apellidoNombre: 'Ada Lovelace',
    dni: 123,
    email: 'ada@example.test'
  }]);
});

test('la carga de calificaciones rechaza mutación histórica antes de consultar alumnos', async () => {
  replaceMethod(cursadaRepository, 'findById', async () => ({
    id: 8,
    materiaId: 3,
    docenteId: 12,
    activo: true,
    anioLectivo: 2025
  }));
  replaceMethod(profesorMateriaRepository, 'findByProfesorAndMateria', async () => null);
  let consultoAlumnos = false;
  replaceMethod(alumnoRepository, 'findByUsuarioIds', async () => {
    consultoAlumnos = true;
    return [];
  });

  await assert.rejects(
    calificacionService.cargarLote(
      { cursadaId: 8, calificaciones: [] },
      { id: 12, rol: ROLES.PROFESOR }
    ),
    (error: any) => error.statusCode === 403
  );
  assert.equal(consultoAlumnos, false);
});

test('la carga de asistencia rechaza mutación histórica antes de consultar inscripciones', async () => {
  replaceMethod(cursadaRepository, 'findById', async () => ({
    id: 8,
    materiaId: 3,
    docenteId: 12,
    activo: true,
    anioLectivo: 2025
  }));
  replaceMethod(profesorMateriaRepository, 'findByProfesorAndMateria', async () => null);
  let consultoInscripciones = false;
  replaceMethod(asistenciaRepository, 'isAlumnoInscripto', async () => {
    consultoInscripciones = true;
    return true;
  });

  await assert.rejects(
    asistenciaService.cargarClase(
      { cursadaId: 8, fecha: '2026-06-15', asistencias: [] },
      { id: 12, rol: ROLES.PROFESOR }
    ),
    (error: any) => error.statusCode === 403
  );
  assert.equal(consultoInscripciones, false);
});
