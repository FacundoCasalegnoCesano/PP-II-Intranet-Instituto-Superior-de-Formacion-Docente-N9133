import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import alumnoRepository from '../src/repositories/alumnoRepository.js';
import asistenciaRepository from '../src/repositories/asistenciaRepository.js';
import asistenciaService from '../src/services/asistenciaService.js';
import { prisma } from '../src/config/prisma.js';
import { ROLES } from '../src/constants/roles.js';
import { listAsistenciasAlumnoQuerySchema } from '../src/validations/asistenciaValidation.js';

const restorations: Array<() => void> = [];

function replaceMethod(target: any, key: string, replacement: unknown) {
  const original = target[key];
  target[key] = replacement;
  restorations.push(() => { target[key] = original; });
}

afterEach(() => {
  while (restorations.length > 0) restorations.pop()?.();
});

test('el modo detalle exige cursadaId y carreraId juntos y valida paginación', () => {
  assert.ok(listAsistenciasAlumnoQuerySchema.validate({}).error === undefined);
  assert.ok(listAsistenciasAlumnoQuerySchema.validate({ cursadaId: 12 }).error);
  assert.ok(listAsistenciasAlumnoQuerySchema.validate({ carreraId: 3, page: 0 }).error);
  assert.ok(listAsistenciasAlumnoQuerySchema.validate({ cursadaId: 12, carreraId: 3, page: 1, limit: 20 }).error === undefined);
});

test('el historial legacy del alumno omite observacion sin cambiar los demás campos', async () => {
  replaceMethod(alumnoRepository, 'findByUsuarioId', async () => ({ idAlumno: 7 }));
  replaceMethod(asistenciaRepository, 'findByAlumno', async () => [{
    id: 1,
    alumnoId: 7,
    cursadaId: 12,
    fecha: new Date('2026-08-20T00:00:00.000Z'),
    presente: false,
    justificado: true,
    observacion: 'dato docente',
    cursada: { materia: { id: 3, nombre: 'Pedagogía' } }
  }]);

  const result = await asistenciaService.getByAlumno(13, { id: 13, rol: ROLES.ALUMNO });
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 1);
  assert.equal('observacion' in result[0], false);
  assert.equal(result[0].presente, false);
  assert.equal(result[0].justificado, true);
});

test('el historial legacy administrativo conserva observacion', async () => {
  replaceMethod(alumnoRepository, 'findByUsuarioId', async () => ({ idAlumno: 7 }));
  replaceMethod(asistenciaRepository, 'findByAlumno', async () => [{ observacion: 'dato docente', presente: true }]);

  const result = await asistenciaService.getByAlumno(13, { id: 1, rol: ROLES.ADMINISTRATIVO });
  assert.ok(Array.isArray(result));
  const item = result[0];
  assert.ok(item);
  assert.ok('observacion' in item);
  assert.equal(item.observacion, 'dato docente');
});

test('el alumno no puede consultar otra cuenta antes de resolver el alumno académico', async () => {
  let resolved = false;
  replaceMethod(alumnoRepository, 'findByUsuarioId', async () => {
    resolved = true;
    return { idAlumno: 7 };
  });

  await assert.rejects(
    asistenciaService.getByAlumno(13, { id: 14, rol: ROLES.ALUMNO }),
    (error: any) => error.statusCode === 403
  );
  assert.equal(resolved, false);
});

test('el detalle valida la cursada y devuelve DTO paginado con fecha calendario', async () => {
  replaceMethod(alumnoRepository, 'findByUsuarioId', async () => ({ idAlumno: 7 }));
  replaceMethod(asistenciaRepository, 'findAlumnoCursada', async () => ({
    id: 99,
    cursada: { id: 12, materia: { id: 3, nombre: 'Pedagogía', carreraId: 4 } }
  }));
  replaceMethod(asistenciaRepository, 'findDetailByAlumno', async () => ({
    data: [{
      cursadaId: 12,
      materia: { id: 3, nombre: 'Pedagogía' },
      anioLectivo: 2025,
      periodo: 'ANUAL',
      fecha: '2025-08-20',
      presente: false,
      justificado: true
    }],
    pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
  }));

  const result = await asistenciaService.getByAlumno(13, { id: 13, rol: ROLES.ALUMNO }, {
    cursadaId: 12,
    carreraId: 4,
    page: 1,
    limit: 20
  });
  assert.ok('pagination' in result);
  assert.deepEqual(result.pagination, { page: 1, limit: 20, total: 1, totalPages: 1 });
  assert.deepEqual(result.data[0], {
    cursadaId: 12,
    materia: { id: 3, nombre: 'Pedagogía' },
    anioLectivo: 2025,
    periodo: 'ANUAL',
    fecha: '2025-08-20',
    presente: false,
    justificado: true
  });
});

test('el detalle devuelve 404 ante cursada no perteneciente o carrera incompatible', async () => {
  replaceMethod(alumnoRepository, 'findByUsuarioId', async () => ({ idAlumno: 7 }));
  replaceMethod(asistenciaRepository, 'findAlumnoCursada', async () => null);

  await assert.rejects(
    asistenciaService.getByAlumno(13, { id: 13, rol: ROLES.ALUMNO }, { cursadaId: 12, carreraId: 4 }),
    (error: any) => error.statusCode === 404
  );
});

test('el repository del detalle limita selección, orden y paginación sin leer observacion', async () => {
  let findManyArgs: any;
  let countArgs: any;
  replaceMethod((prisma.asistencia as any), 'findMany', async (args: any) => {
    findManyArgs = args;
    return [{
      id: 8,
      fecha: new Date('2025-08-20T00:00:00.000Z'),
      presente: false,
      justificado: true,
      observacion: 'no debe salir',
      cursada: { id: 12, anioLectivo: 2025, periodo: 'ANUAL', materia: { id: 3, nombre: 'Pedagogía' } }
    }];
  });
  replaceMethod((prisma.asistencia as any), 'count', async (args: any) => {
    countArgs = args;
    return 1;
  });

  const result = await asistenciaRepository.findDetailByAlumno(7, 12, { page: 2, limit: 5 });
  assert.deepEqual(findManyArgs.where, { alumnoId: 7, cursadaId: 12 });
  assert.deepEqual(countArgs, { where: { alumnoId: 7, cursadaId: 12 } });
  assert.equal(findManyArgs.skip, 5);
  assert.equal(findManyArgs.take, 5);
  assert.deepEqual(findManyArgs.orderBy, [{ fecha: 'desc' }, { id: 'desc' }]);
  assert.equal(findManyArgs.select.observacion, undefined);
  assert.equal(result.data[0].fecha, '2025-08-20');
  assert.equal('observacion' in result.data[0], false);
});

test('la comprobación de cursada histórica no filtra BAJA', async () => {
  let query: any;
  replaceMethod((prisma.inscripcionMateria as any), 'findFirst', async (args: any) => {
    query = args;
    return { id: 99, cursada: { id: 12, materia: { id: 3, nombre: 'Pedagogía', carreraId: 4 } } };
  });

  await asistenciaRepository.findAlumnoCursada(7, 12);
  assert.deepEqual(query.where, { alumnoId: 7, cursadaId: 12 });
  assert.equal(query.where.estado, undefined);
});
