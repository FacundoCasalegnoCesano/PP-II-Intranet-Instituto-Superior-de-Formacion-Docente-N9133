import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { prisma } from '../src/config/prisma.js';
import { ROLES } from '../src/constants/roles.js';
import homologacionRepository from '../src/repositories/homologacionRepository.js';
import alumnoRepository from '../src/repositories/alumnoRepository.js';
import materiaRepository from '../src/repositories/materiaRepository.js';
import userRepository from '../src/repositories/userRepository.js';
import homologacionService from '../src/services/homologacionService.js';
import estadoAcademicoService from '../src/services/estadoAcademicoService.js';
import carreraRepository from '../src/repositories/carreraRepository.js';
import { crearHomologacionSchema } from '../src/validations/homologacionValidation.js';
import { AppError } from '../src/utils/AppError.js';
import inscripcionCarreraRepository from '../src/repositories/inscripcionCarreraRepository.js';
import { toHomologacionDto } from '../src/dtos/homologacionDto.js';
import homologacionController from '../src/controllers/homologacionController.js';
import { listarHomologacionesSchema } from '../src/validations/homologacionValidation.js';

const restorations: Array<() => void> = [];

function replaceMethod(target: any, key: string, replacement: any) {
  const original = target[key];
  target[key] = replacement;
  restorations.push(() => {
    target[key] = original;
  });
}

const admin = { rol: ROLES.ADMINISTRATIVO, activo: true };

function stubCreationDependencies() {
  replaceMethod(userRepository, 'findById', async () => ({ rol: ROLES.ALUMNO, activo: true }));
  replaceMethod(alumnoRepository, 'findByUsuarioId', async () => ({ idAlumno: 101 }));
  replaceMethod(materiaRepository, 'findById', async () => ({ id: 30, carreraId: 3, notaMinima: 6 }));
  replaceMethod(inscripcionCarreraRepository, 'findByUsuarioAndCarrera', async () => ({ id: 501 }));
  replaceMethod(prisma.homologacion, 'findUnique', async () => null);
}

function stubPendingPartial(notaExamenHomologacion: number | null = null) {
  replaceMethod(homologacionRepository, 'findById', async () => ({
    id: 1,
    materiaId: 30,
    tipoHomologacion: 'PARCIAL',
    estado: 'PENDIENTE',
    calificacion: null,
    notaExamenHomologacion
  }));
  replaceMethod(materiaRepository, 'findById', async () => ({ id: 30, notaMinima: 6 }));
}

afterEach(() => {
  while (restorations.length > 0) restorations.pop()?.();
});

test('crea una total pendiente con la nota de la institución anterior', async () => {
  stubCreationDependencies();
  let createdData: any;
  replaceMethod(homologacionRepository, 'create', async (data: any) => {
    createdData = data;
    return rawHomologacion({ tipoHomologacion: data.tipoHomologacion, calificacion: data.calificacion ?? null });
  });

  const result = await homologacionService.crearSolicitud({
    alumnoId: 20,
    materiaId: 30,
    tipoHomologacion: 'TOTAL',
    calificacion: 8
  }, admin);

  assert.equal(result.calificacion, 8);
  assert.deepEqual(createdData, {
    alumnoId: 101,
    materiaId: 30,
    tipoHomologacion: 'TOTAL',
    calificacion: 8
  });
});

test('crea una parcial pendiente sin calificación definitiva', async () => {
  stubCreationDependencies();
  let createdData: any;
  replaceMethod(homologacionRepository, 'create', async (data: any) => {
    createdData = data;
    return rawHomologacion({ tipoHomologacion: data.tipoHomologacion, calificacion: data.calificacion ?? null });
  });

  const result = await homologacionService.crearSolicitud({
    alumnoId: 20,
    materiaId: 30,
    tipoHomologacion: 'PARCIAL'
  }, admin);

  assert.equal(result.calificacion, null);
  assert.deepEqual(createdData, {
    alumnoId: 101,
    materiaId: 30,
    tipoHomologacion: 'PARCIAL',
    calificacion: null
  });
});

test('conserva una nota complementaria insuficiente sin aprobar', async () => {
  stubPendingPartial();
  let updateData: any;
  replaceMethod(homologacionRepository, 'update', async (_id: number, data: any) => {
    updateData = data;
    return rawHomologacion({
      id: 1,
      estado: 'PENDIENTE',
      calificacion: null,
      notaExamenHomologacion: data.notaExamenHomologacion
    });
  });

  const result = await homologacionService.cargarNotaComplementaria(1, 4, admin);

  assert.equal(result.estado, 'PENDIENTE');
  assert.equal(result.notaComplementaria, 4);
  assert.equal(updateData.notaExamenHomologacion, 4);
});

test('al aprobar una parcial copia el complementario como nota definitiva', async () => {
  stubPendingPartial(7);
  const updates: any[] = [];
  replaceMethod(homologacionRepository, 'update', async (_id: number, data: any) => {
    updates.push(data);
    return rawHomologacion({ id: 1, ...data });
  });

  const result = await homologacionService.resolver(1, 'APROBAR', admin);

  assert.deepEqual(updates, [{ estado: 'APROBADA', calificacion: 7 }]);
  assert.equal(result.estado, 'APROBADA');
  assert.equal(result.calificacion, 7);
});

test('integra la copia parcial con su consumo académico como definitiva', async () => {
  const updates: any[] = [];
  let stored = rawHomologacion({
    id: 1,
    tipoHomologacion: 'PARCIAL',
    estado: 'PENDIENTE',
    calificacion: null,
    notaExamenHomologacion: 7
  });
  replaceMethod(homologacionRepository, 'findById', async () => stored);
  replaceMethod(materiaRepository, 'findById', async () => ({ id: 30, notaMinima: 6 }));
  replaceMethod(homologacionRepository, 'update', async (_id: number, data: any) => {
    updates.push(data);
    stored = { ...stored, ...data };
    return stored;
  });

  await homologacionService.resolver(1, 'APROBAR', admin);

  assert.deepEqual(updates, [{ estado: 'APROBADA', calificacion: 7 }]);
  assert.equal(stored.calificacion, 7);

  replaceMethod(alumnoRepository, 'findByUsuarioId', async () => ({ idAlumno: 101 }));
  replaceMethod(prisma.inscripcionExamen, 'findMany', async () => []);
  replaceMethod(prisma.inscripcionMateria, 'findMany', async () => []);
  replaceMethod(prisma.homologacion, 'findMany', async () => [stored]);
  const promedio = await estadoAcademicoService.getPromedioGeneral(20, admin);

  assert.deepEqual(promedio.materias, [{ materiaId: 30, nombre: 'Álgebra y Geometría', nota: 7, via: 'HOMOLOGACION' }]);

  replaceMethod(carreraRepository, 'getPlanEstudio', async () => ({
    id: 3,
    nombre: 'Profesorado de Matemática',
    activo: true,
    duracionAnios: 4,
    materias: [{ id: 30, nombre: 'Álgebra y Geometría', carreraId: 3, cursoId: null, curso: null }]
  }));
  const trayectoria = await estadoAcademicoService.getTrayectoriaIntegral(
    20,
    3,
    admin
  );

  assert.equal(trayectoria.materias[0].definitiva?.nota, 7);
  assert.equal(trayectoria.materias[0].definitiva?.via, 'HOMOLOGACION');
});

test('rechaza aprobar una parcial con nota insuficiente', async () => {
  stubPendingPartial(4);
  const updates: any[] = [];
  replaceMethod(homologacionRepository, 'update', async (_id: number, data: any) => {
    updates.push(data);
    return data;
  });

  await assert.rejects(
    homologacionService.resolver(1, 'APROBAR', admin),
    (error: any) => error instanceof AppError && error.statusCode === 400
  );
  assert.deepEqual(updates, []);
});

test('el repository persiste una solicitud parcial nullable y siempre PENDIENTE', async () => {
  let createArgs: any;
  replaceMethod(prisma.homologacion, 'create', async (args: any) => {
    createArgs = args;
    return args.data;
  });

  await homologacionRepository.create({
    alumnoId: 101,
    materiaId: 30,
    tipoHomologacion: 'PARCIAL',
    calificacion: null
  });

  assert.deepEqual(createArgs.data, {
    alumnoId: 101,
    materiaId: 30,
    tipoHomologacion: 'PARCIAL',
    calificacion: null,
    observacion: null,
    estado: 'PENDIENTE'
  });
});

test('el repository actualiza estado y nota definitiva en un único payload', async () => {
  let updateArgs: any;
  replaceMethod(prisma.homologacion, 'update', async (args: any) => {
    updateArgs = args;
    return args.data;
  });

  await homologacionRepository.update(1, { estado: 'APROBADA', calificacion: 7 });

  assert.deepEqual(updateArgs.where, { id: 1 });
  assert.deepEqual(updateArgs.data, { estado: 'APROBADA', calificacion: 7 });
});

test('exige nota previa para TOTAL en Joi', () => {
  const result = crearHomologacionSchema.validate({
    alumnoId: 20,
    materiaId: 30,
    tipoHomologacion: 'TOTAL'
  });

  assert.equal(result.error?.message, 'La nota de la institución anterior es requerida para una homologación total.');
});

test('normaliza la nota definitiva de PARCIAL a null en Joi', () => {
  const result = crearHomologacionSchema.validate({
    alumnoId: 20,
    materiaId: 30,
    tipoHomologacion: 'PARCIAL',
    calificacion: 9
  });

  assert.equal(result.error, undefined);
  assert.equal(result.value.calificacion, null);
});

test('el promedio sólo consume homologaciones APROBADA con nota definitiva', async () => {
  replaceMethod(alumnoRepository, 'findByUsuarioId', async () => ({ idAlumno: 101 }));
  replaceMethod(prisma.inscripcionExamen, 'findMany', async () => []);
  let homologacionWhere: any;
  replaceMethod(prisma.homologacion, 'findMany', async (args: any) => {
    homologacionWhere = args.where;
    return [
      { estado: 'PENDIENTE', calificacion: 9, materia: { id: 30, nombre: 'Pendiente', carreraId: 3 } },
      { estado: 'RECHAZADA', calificacion: 10, materia: { id: 31, nombre: 'Rechazada', carreraId: 3 } },
      { estado: 'APROBADA', calificacion: null, materia: { id: 32, nombre: 'Sin definitiva', carreraId: 3 } }
    ].filter(row => row.estado === args.where.estado &&
      (args.where.calificacion ? row.calificacion !== null : true));
  });
  replaceMethod(prisma.inscripcionMateria, 'findMany', async () => []);

  const result = await estadoAcademicoService.getPromedioGeneral(
    20,
    { id: 1, rol: ROLES.ADMINISTRATIVO }
  );

  assert.deepEqual(homologacionWhere, {
    alumnoId: 101,
    estado: 'APROBADA',
    calificacion: { not: null }
  });
  assert.equal(result.cantidadMateriasAprobadas, 0);
  assert.equal(result.promedioGeneral, null);
});

function rawHomologacion(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    alumnoId: 101,
    materiaId: 30,
    tipoHomologacion: 'PARCIAL',
    calificacion: null,
    notaExamenHomologacion: 7,
    estado: 'PENDIENTE',
    observacion: null,
    fechaHomologacion: new Date('2026-09-15T12:00:00.000Z'),
    createdAt: new Date('2026-09-15T12:00:00.000Z'),
    updatedAt: new Date('2026-09-15T12:30:00.000Z'),
    alumno: {
      idAlumno: 101,
      idCuenta: 20,
      usuario: {
        idUsuario: 20,
        apellidoNombre: 'Lucia Test Fernandez',
        dni: 42666888,
        email: 'lucia@example.test'
      }
    },
    materia: {
      id: 30,
      nombre: 'Álgebra y Geometría',
      carreraId: 3,
      notaMinima: null,
      carrera: { id: 3, nombre: 'Profesorado de Matemática' }
    },
    ...overrides
  };
}

test('lista por búsqueda, estado, tipo, carrera y materia', async () => {
  let findManyArgs: any;
  let countArgs: any;
  replaceMethod(prisma.homologacion, 'findMany', async (args: any) => {
    findManyArgs = args;
    return [rawHomologacion()];
  });
  replaceMethod(prisma.homologacion, 'count', async (args: any) => {
    countArgs = args;
    return 1;
  });

  const result = await homologacionService.listar({
    search: 'Lucia',
    estado: 'PENDIENTE',
    tipo: 'PARCIAL',
    carreraId: 3,
    materiaId: 30,
    page: 2,
    limit: 10
  }, admin);

  assert.equal(findManyArgs.where, countArgs.where);
  assert.deepEqual(findManyArgs.where, {
    estado: 'PENDIENTE',
    tipoHomologacion: 'PARCIAL',
    materiaId: 30,
    materia: { carreraId: 3 },
    OR: [
      { alumno: { usuario: { apellidoNombre: { contains: 'Lucia' } } } },
      { alumno: { usuario: { email: { contains: 'Lucia' } } } }
    ]
  });
  assert.equal(result.data[0]?.alumno.idUsuario, 20);
  assert.equal(result.pagination.page, 2);
});

test('no expone Alumno.idAlumno en el DTO', () => {
  const dto = toHomologacionDto(rawHomologacion() as any);

  assert.equal(dto.alumno.idUsuario, 20);
  assert.equal('idAlumno' in dto.alumno, false);
  assert.equal('alumnoId' in dto, false);
  assert.equal(dto.materia.notaMinima, 6);
  assert.equal(dto.fecha, '2026-09-15T12:00:00.000Z');
});

test('devuelve detalle administrativo con nota mínima', async () => {
  replaceMethod(homologacionRepository, 'findById', async () => rawHomologacion({ id: 7 }));

  const result = await homologacionService.obtener(7, admin);

  assert.equal(result.id, 7);
  assert.equal(result.materia.notaMinima, 6);
  assert.equal(result.notaComplementaria, 7);
  assert.equal('idAlumno' in result.alumno, false);
});

test('rechaza una materia ajena a las carreras activas del alumno', async () => {
  stubCreationDependencies();
  replaceMethod(inscripcionCarreraRepository, 'findByUsuarioAndCarrera', async () => null);

  await assert.rejects(
    homologacionService.crearSolicitud({
      alumnoId: 20,
      materiaId: 30,
      tipoHomologacion: 'TOTAL',
      calificacion: 8
    }, admin),
    (error: any) => error instanceof AppError && error.statusCode === 400
  );
});

test('acepta una cuenta multirrol con ALUMNO y rechaza una inactiva', async () => {
  stubCreationDependencies();
  replaceMethod(userRepository, 'findById', async () => ({
    rol: 'PROFESOR, ALUMNO',
    activo: true
  }));
  replaceMethod(homologacionRepository, 'create', async (data: any) => rawHomologacion({
    ...data,
    tipoHomologacion: data.tipoHomologacion,
    alumno: rawHomologacion().alumno,
    materia: rawHomologacion().materia
  }));

  const result = await homologacionService.crearSolicitud({
    alumnoId: 20,
    materiaId: 30,
    tipoHomologacion: 'TOTAL',
    calificacion: 8
  }, admin);
  assert.equal(result.alumno.idUsuario, 20);

  replaceMethod(userRepository, 'findById', async () => ({
    rol: 'ALUMNO,PROFESOR',
    activo: false
  }));
  await assert.rejects(
    homologacionService.crearSolicitud({
      alumnoId: 20,
      materiaId: 30,
      tipoHomologacion: 'TOTAL',
      calificacion: 8
    }, admin),
    (error: any) => error instanceof AppError && error.statusCode === 403
  );
});

test('el filtro administrativo público no acepta alumnoId interno', () => {
  const result = listarHomologacionesSchema.validate(
    { alumnoId: 101 },
    { stripUnknown: true }
  );

  assert.equal(result.error, undefined);
  assert.equal('alumnoId' in result.value, false);
});

test('exige contexto ADMINISTRATIVO definido para consultas y mutaciones', async () => {
  replaceMethod(homologacionRepository, 'findAll', async () => ({
    data: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
  }));
  replaceMethod(homologacionRepository, 'findById', async () => null);

  await assert.rejects(
    homologacionService.listar({}, undefined),
    (error: any) => error instanceof AppError && error.statusCode === 403
  );
  await assert.rejects(
    homologacionService.obtener(1, { rol: ROLES.ALUMNO }),
    (error: any) => error instanceof AppError && error.statusCode === 403
  );
  await assert.rejects(
    homologacionService.cargarNotaComplementaria(1, 7, undefined),
    (error: any) => error instanceof AppError && error.statusCode === 403
  );
  await assert.rejects(
    homologacionService.resolver(1, 'RECHAZAR', undefined),
    (error: any) => error instanceof AppError && error.statusCode === 403
  );
  await assert.rejects(
    homologacionService.listar({}, { rol: ROLES.ADMINISTRATIVO, activo: false }),
    (error: any) => error instanceof AppError && error.statusCode === 403
  );
});

test('usa AppError 404 para un alumno inexistente en mis solicitudes', async () => {
  replaceMethod(alumnoRepository, 'findByUsuarioId', async () => null);

  await assert.rejects(
    homologacionService.getMisSolicitudes(20),
    (error: any) => error instanceof AppError && error.statusCode === 404
  );
});

test('usa AppError 404 para homologación, materia y alumno inexistentes', async () => {
  replaceMethod(homologacionRepository, 'findById', async () => null);
  await assert.rejects(
    homologacionService.cargarNotaComplementaria(1, 7, admin),
    (error: any) => error instanceof AppError && error.statusCode === 404
  );

  stubCreationDependencies();
  replaceMethod(userRepository, 'findById', async () => null);
  await assert.rejects(
    homologacionService.crearSolicitud({
      alumnoId: 20,
      materiaId: 30,
      tipoHomologacion: 'TOTAL',
      calificacion: 8
    }, admin),
    (error: any) => error instanceof AppError && error.statusCode === 404
  );

  stubCreationDependencies();
  replaceMethod(materiaRepository, 'findById', async () => null);
  await assert.rejects(
    homologacionService.crearSolicitud({
      alumnoId: 20,
      materiaId: 30,
      tipoHomologacion: 'TOTAL',
      calificacion: 8
    }, admin),
    (error: any) => error instanceof AppError && error.statusCode === 404
  );
});

test('usa AppError 400 para tipo o nota inválidos', async () => {
  replaceMethod(homologacionRepository, 'findById', async () => ({
    id: 1,
    materiaId: 30,
    tipoHomologacion: 'TOTAL',
    estado: 'PENDIENTE',
    calificacion: 8,
    notaExamenHomologacion: null
  }));
  await assert.rejects(
    homologacionService.cargarNotaComplementaria(1, 7, admin),
    (error: any) => error instanceof AppError && error.statusCode === 400
  );

  stubPendingPartial();
  await assert.rejects(
    homologacionService.cargarNotaComplementaria(1, 11, admin),
    (error: any) => error instanceof AppError && error.statusCode === 400
  );
});

test('usa AppError 409 para conflictos de estado del ciclo de vida', async () => {
  replaceMethod(homologacionRepository, 'findById', async () => ({
    id: 1,
    materiaId: 30,
    tipoHomologacion: 'PARCIAL',
    estado: 'APROBADA',
    calificacion: 8,
    notaExamenHomologacion: 8
  }));

  await assert.rejects(
    homologacionService.cargarNotaComplementaria(1, 8, admin),
    (error: any) => error instanceof AppError && error.statusCode === 409
  );
  await assert.rejects(
    homologacionService.resolver(1, 'RECHAZAR', admin),
    (error: any) => error instanceof AppError && error.statusCode === 409
  );
});

test('valida IDs positivos en los dos controllers de mutación', async () => {
  replaceMethod(homologacionService, 'cargarNotaComplementaria', async () => {
    throw new Error('no debe invocarse');
  });
  replaceMethod(homologacionService, 'resolver', async () => {
    throw new Error('no debe invocarse');
  });

  const response = { json() {}, status() { return this; } } as any;
  const errors: any[] = [];
  await homologacionController.cargarNotaComplementaria(
    { params: { id: '0' }, body: { notaExamenHomologacion: 7 }, user: admin } as any,
    response,
    (error: any) => errors.push(error)
  );
  await homologacionController.resolver(
    { params: { id: '-1' }, body: { accion: 'RECHAZAR' }, user: admin } as any,
    response,
    (error: any) => errors.push(error)
  );

  assert.equal(errors.length, 2);
  assert.ok(errors.every(error => error instanceof AppError && error.statusCode === 400));
});
