import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { cargaMasivaSchema } from '../src/validations/asistenciaValidation.js';
import asistenciaRepository from '../src/repositories/asistenciaRepository.js';
import asistenciaService from '../src/services/asistenciaService.js';
import cursadaRepository from '../src/repositories/cursadaRepository.js';
import alumnoRepository from '../src/repositories/alumnoRepository.js';
import { ROLES } from '../src/constants/roles.js';
import { prisma } from '../src/config/prisma.js';
import { parse } from 'yaml';
import { readFileSync } from 'node:fs';

const restorations: Array<() => void> = [];
function replaceMethod(target: any, key: string, replacement: any) {
  const original = target[key];
  target[key] = replacement;
  restorations.push(() => { target[key] = original; });
}
afterEach(() => { while (restorations.length) restorations.pop()?.(); });

const admin = { id: 1, rol: ROLES.ADMINISTRATIVO };
const rows = (count: number) => Array.from({ length: count }, (_, index) => ({ alumnoId: index + 10, presente: true }));

test('rechaza más de 500 filas en el schema', () => {
  const result = cargaMasivaSchema.validate({ cursadaId: 1, fecha: '2026-08-20', asistencias: rows(501) });
  assert.match(result.error?.message ?? '', /500/);
  assert.equal(cargaMasivaSchema.validate({ cursadaId: 1, fecha: '2026-08-20', asistencias: rows(500) }).error, undefined);
  const openApi = parse(readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8')) as any;
  assert.equal(openApi.components.schemas.CargaAsistenciaRequest.properties.asistencias.maxItems, 500);
});

test('valida alumnos y matrículas con una consulta agrupada para cargas de 1 y 100 filas', async () => {
  for (const size of [1, 100]) {
    let groupedStudentLookups = 0;
    let groupedLookups = 0;
    let individualLookups = 0;
    let writes = 0;
    let writtenRows: any[] = [];
    const inputRows = rows(size);
    inputRows[0] = { alumnoId: 10, presente: false, justificado: true, observacion: 'Constancia' };
    replaceMethod(cursadaRepository, 'findById', async () => ({ anioLectivo: 2026 }));
    replaceMethod(alumnoRepository, 'findByUsuarioIds', async (userIds: number[]) => {
      groupedStudentLookups += 1;
      return userIds.map((idCuenta, index) => ({ idCuenta, idAlumno: index + 100 }));
    });
    replaceMethod(asistenciaRepository, 'findInscripcionesByCursadaAndAlumnoIds', async (_id: number, alumnoIds: number[]) => {
      groupedLookups += 1;
      return alumnoIds.map(alumnoId => ({ alumnoId }));
    });
    replaceMethod(asistenciaRepository, 'isAlumnoInscripto', async () => { individualLookups += 1; return true; });
    replaceMethod(asistenciaRepository, 'upsertClase', async (_id: number, _date: Date, values: any[]) => { writes += 1; writtenRows = values; return values; });

    const result = await asistenciaService.cargarClase({ cursadaId: 1, fecha: '2026-08-20', asistencias: inputRows }, admin);
    assert.deepEqual(result, { registros: size, fecha: new Date('2026-08-20T00:00:00.000Z') });
    assert.equal(groupedStudentLookups, 1);
    assert.equal(groupedLookups, 1);
    assert.equal(individualLookups, 0);
    assert.equal(writes, 1);
    assert.deepEqual(writtenRows[0], { idAlumno: 100, presente: false, justificado: true, observacion: 'Constancia' });
  }
});

test('rechaza identificadores de alumno repetidos antes de consultar o escribir', async () => {
  let validations = 0;
  let writes = 0;
  replaceMethod(alumnoRepository, 'findByUsuarioIds', async () => [{ idCuenta: 10, idAlumno: 7 }]);
  replaceMethod(cursadaRepository, 'findById', async () => ({ anioLectivo: 2026 }));
  replaceMethod(asistenciaRepository, 'findInscripcionesByCursadaAndAlumnoIds', async () => { validations += 1; return []; });
  replaceMethod(asistenciaRepository, 'upsertClase', async () => { writes += 1; return []; });
  await assert.rejects(
    asistenciaService.cargarClase({ cursadaId: 1, fecha: '2026-08-20', asistencias: [rows(1)[0], rows(1)[0]] }, admin),
    (error: any) => error.statusCode === 400 && /repetido/.test(error.message)
  );
  assert.equal(validations, 0);
  assert.equal(writes, 0);
});

test('un permiso inválido falla antes de consultar identidades o inscripciones', async () => {
  let validations = 0;
  let writes = 0;
  replaceMethod(alumnoRepository, 'findByUsuarioIds', async () => { validations += 1; return []; });
  replaceMethod(asistenciaRepository, 'findInscripcionesByCursadaAndAlumnoIds', async () => { validations += 1; return []; });
  replaceMethod(asistenciaRepository, 'upsertClase', async () => { writes += 1; return []; });
  await assert.rejects(
    asistenciaService.cargarClase({ cursadaId: 1, fecha: '2026-08-20', asistencias: rows(1) }, { id: 10, rol: ROLES.ALUMNO }),
    (error: any) => error.statusCode === 403
  );
  assert.equal(validations, 0);
  assert.equal(writes, 0);
});

test('un alumno sin inscripción en esta cursada es rechazado sin exponer datos de otros alumnos', async () => {
  let writes = 0;
  replaceMethod(alumnoRepository, 'findByUsuarioIds', async () => [{ idCuenta: 10, idAlumno: 7 }]);
  replaceMethod(cursadaRepository, 'findById', async () => ({ anioLectivo: 2026 }));
  replaceMethod(asistenciaRepository, 'findInscripcionesByCursadaAndAlumnoIds', async () => []);
  replaceMethod(asistenciaRepository, 'upsertClase', async () => { writes += 1; return []; });
  await assert.rejects(
    asistenciaService.cargarClase({ cursadaId: 1, fecha: '2026-08-20', asistencias: rows(1) }, admin),
    (error: any) => error.statusCode === 400 && /no está inscripto a esta cursada/.test(error.message)
  );
  assert.equal(writes, 0);
});

test('si falla la escritura en lote, propaga el error sin un segundo intento parcial', async () => {
  let writes = 0;
  replaceMethod(alumnoRepository, 'findByUsuarioIds', async (_ids: number[]) => [
    { idCuenta: 10, idAlumno: 100 }, { idCuenta: 11, idAlumno: 101 }
  ]);
  replaceMethod(cursadaRepository, 'findById', async () => ({ anioLectivo: 2026 }));
  replaceMethod(asistenciaRepository, 'findInscripcionesByCursadaAndAlumnoIds', async (_id: number, alumnoIds: number[]) => alumnoIds.map(alumnoId => ({ alumnoId })));
  replaceMethod(asistenciaRepository, 'upsertClase', async () => { writes += 1; throw new Error('transaction failed'); });
  await assert.rejects(
    asistenciaService.cargarClase({ cursadaId: 1, fecha: '2026-08-20', asistencias: rows(2) }, admin),
    /transaction failed/
  );
  assert.equal(writes, 1);
});

test('reintenta una vez la transacción ante carrera de clave única de asistencia', async () => {
  let transactions = 0;
  replaceMethod(prisma.asistencia, 'upsert', () => Promise.resolve({ id: 1 }));
  replaceMethod(prisma, '$transaction', async () => {
    transactions += 1;
    if (transactions === 1) throw Object.assign(new Error('duplicate'), {
      code: 'P2002', meta: { target: 'asistencias_cursada_id_alumno_id_fecha_key' }
    });
    return [{ id: 1 }];
  });
  const result = await asistenciaRepository.upsertClase(1, new Date('2026-08-20'), [
    { idAlumno: 100, presente: true }
  ]);
  assert.equal(result.length, 1);
  assert.equal(transactions, 2);
});

test('no reintenta una clave única ajena a asistencia', async () => {
  let transactions = 0;
  replaceMethod(prisma.asistencia, 'upsert', () => Promise.resolve({ id: 1 }));
  replaceMethod(prisma, '$transaction', async () => {
    transactions += 1;
    throw Object.assign(new Error('duplicate'), { code: 'P2002', meta: { target: 'usuario_email_key' } });
  });
  await assert.rejects(asistenciaRepository.upsertClase(1, new Date('2026-08-20'), [
    { idAlumno: 100, presente: true }
  ]), /duplicate/);
  assert.equal(transactions, 1);
});

test('ordena las escrituras por idAlumno para reducir deadlocks entre lotes concurrentes', async () => {
  const ids: number[] = [];
  replaceMethod(prisma.asistencia, 'upsert', (args: any) => {
    ids.push(args.where.cursadaId_alumnoId_fecha.alumnoId);
    return Promise.resolve({ id: args.where.cursadaId_alumnoId_fecha.alumnoId });
  });
  replaceMethod(prisma, '$transaction', async (operations: Promise<unknown>[]) => Promise.all(operations));
  await asistenciaRepository.upsertClase(1, new Date('2026-08-20'), [
    { idAlumno: 20, presente: true },
    { idAlumno: 10, presente: false }
  ]);
  assert.deepEqual(ids, [10, 20]);
});
