import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { prisma } from '../src/config/prisma.js';
import { ROLES } from '../src/constants/roles.js';
import promocionHistoricaService from '../src/services/promocionHistoricaService.js';
import estadoAcademicoService from '../src/services/estadoAcademicoService.js';

const restorations: Array<() => void> = [];
function replace(target: any, key: string, value: any) {
  const original = target[key];
  target[key] = value;
  restorations.push(() => { if (original === undefined) delete target[key]; else target[key] = original; });
}
afterEach(() => { while (restorations.length) restorations.pop()?.(); });

const actor = { id: 4, rol: ROLES.ADMINISTRATIVO };
const oldYear = new Date().getFullYear() - 5;
const fecha = new Date('2019-11-14T00:00:00.000Z');

function promotionRow(overrides: any = {}) {
  return {
    id: 12, notaFinal: 8, fechaAcreditacion: fecha, version: 1,
    inscripcionMateria: {
      id: 51, alumnoId: 14, alumno: { idCuenta: 20, usuario: { apellidoNombre: 'Alumna Demo' } },
      cursadaId: 81, cicloLectivo: oldYear,
      materiaId: 7, materia: { id: 7, nombre: 'Historia', carreraId: 3, espacioCurricularId: null, carrera: { id: 3, nombre: 'Profesorado' }, notaMinima: 6 },
      cursada: { id: 81, anioLectivo: oldYear, periodo: 'ANUAL', cursadaEspacioId: null }
    },
    auditorias: [{ version: 1, notaAnterior: null, notaNueva: 8, fechaAnterior: null, fechaNueva: fecha, motivo: 'Alta administrativa', actor: { idUsuario: 4, apellidoNombre: 'Admin' }, createdAt: fecha }],
    ...overrides
  };
}

function transactionMocks(spaceId: number | null = null) {
  let registrationCreated = false;
  let promotionData: any;
  let auditData: any;
  let registrationReads = 0;
  const row = promotionRow();
  const mocks: any = { spaceLookup: undefined, spaceLock: undefined };
  const tx: any = {
    $queryRaw: async () => [],
    cursada: { findUnique: async () => ({ id: 81, materiaId: 7, anioLectivo: oldYear, cursadaEspacioId: null, materia: { id: 7, carreraId: 3, espacioCurricularId: spaceId, notaMinima: 6 } }) },
    inscripcionCarrera: { findFirst: async () => ({ id: 5 }) },
    inscripcionMateria: {
      findUnique: async () => {
        registrationReads++;
        return registrationReads === 1 ? null : { id: 51, alumnoId: 14, materiaId: 7, cursadaId: 81, cicloLectivo: oldYear };
      },
      create: async ({ data }: any) => { registrationCreated = true; return { id: 51, alumnoId: 14, materiaId: 7, cursadaId: 81, cicloLectivo: oldYear, ...data }; }
    },
    promocionHistorica: {
      create: async ({ data }: any) => { promotionData = data; return row; },
      findUnique: async () => row
    },
    promocionHistoricaAuditoria: {
      create: async ({ data }: any) => { auditData = data; return data; }
    },
    espacioCurricular: {
      findFirst: async ({ where }: any) => { mocks.spaceLookup = where; return { composicionBloqueadaAt: null, materias: [{ id: 7 }, { id: 8 }] }; },
      updateMany: async ({ where }: any) => { mocks.spaceLock = where; return { count: 1 }; }
    }
  };
  replace(prisma.alumno, 'findUnique', async () => ({ idAlumno: 14, idCuenta: 20, usuario: { apellidoNombre: 'Alumna Demo', rol: 'ALUMNO' } }));
  replace(prisma, '$transaction', async (callback: (client: any) => Promise<unknown>, options: any) => {
    assert.equal(options.isolationLevel, 'Serializable');
    return callback(tx);
  });
  return { tx, get registrationCreated() { return registrationCreated; }, get promotionData() { return promotionData; }, get auditData() { return auditData; }, get spaceLookup() { return mocks.spaceLookup; }, get spaceLock() { return mocks.spaceLock; } };
}

test('alta de promoción crea matrícula y auditoría en una transacción y responde con IDs externos correctos', async () => {
  const mocks = transactionMocks();
  const result = await promocionHistoricaService.create({ alumnoId: 20, cursadaId: 81, notaFinal: 8, fechaAcreditacion: '2019-11-14' }, actor);
  assert.equal(mocks.registrationCreated, true);
  assert.equal(mocks.promotionData.inscripcionMateriaId, 51);
  assert.equal(mocks.promotionData.auditorias.create.actorId, actor.id);
  assert.equal(mocks.promotionData.auditorias.create.version, 1);
  assert.equal(result.alumnoId, 20);
  assert.equal(result.alumno.apellidoNombre, 'Alumna Demo');
  assert.equal(result.cursadaId, 81);
  assert.equal(result.via, 'PROMOCION_DIRECTA');
  assert.equal(result.estado, 'VIGENTE');
});

test('corrección valida versión, exige motivo y agrega una entrada de auditoría sin borrar la anterior', async () => {
  const mocks = transactionMocks();
  let updated: any;
  let existing = promotionRow();
  mocks.tx.promocionHistorica.findUnique = async () => existing;
  mocks.tx.promocionHistorica.updateMany = async ({ where, data }: any) => {
    updated = { where, data };
    existing = { ...existing, notaFinal: data.notaFinal, fechaAcreditacion: data.fechaAcreditacion, version: existing.version + data.version.increment };
    return { count: 1 };
  };
  mocks.tx.promocionHistoricaAuditoria.create = async ({ data }: any) => {
    existing = { ...existing, auditorias: [...existing.auditorias, { ...data, actor: { idUsuario: actor.id, apellidoNombre: 'Admin' }, createdAt: fecha }] };
    return data;
  };
  const result = await promocionHistoricaService.update(12, { notaFinal: 9, motivo: 'Rectificación del acta', expectedVersion: 1 }, actor);
  assert.deepEqual(updated.where, { id: 12, version: 1 });
  assert.equal(updated.data.version.increment, 1);
  assert.equal(result.estado, 'CORREGIDA');
  assert.equal(result.notaFinal, 9);
  assert.equal(result.version, 2);
  assert.equal(result.auditoria.length, 2);
  assert.equal(result.auditoria[1].motivo, 'Rectificación del acta');
});

test('nota no aprobatoria no crea matrícula ni promoción', async () => {
  const mocks = transactionMocks();
  mocks.tx.promocionHistorica.create = async () => assert.fail('no debe crear promoción');
  await assert.rejects(
    promocionHistoricaService.create({ alumnoId: 20, cursadaId: 81, notaFinal: 5, fechaAcreditacion: '2019-11-14' }, actor),
    /mínimo aprobatorio/
  );
  assert.equal(mocks.registrationCreated, false);
});

test('filtros combinados de historial se aplican a una sola inscripción y alcance de materia', async () => {
  let query: any;
  replace(prisma as any, 'promocionHistorica', { findMany: async (args: any) => { query = args; return []; } });
  await promocionHistoricaService.list({ alumnoId: 20, carreraId: 3, materiaId: 7, cicloLectivo: 2018, cursadaId: 81 }, actor);
  assert.deepEqual(query.where, {
    alumno: { idCuenta: 20 },
    inscripcionMateria: { materia: { carreraId: 3 }, materiaId: 7, cicloLectivo: 2018, cursadaId: 81 }
  });
});

test('la promoción del segundo componente bloquea la composición del espacio correcto', async () => {
  const mocks = transactionMocks(102);
  replace(estadoAcademicoService, 'getMateriasAprobadasSet', async () => new Set([8]));
  await promocionHistoricaService.create({ alumnoId: 20, cursadaId: 81, notaFinal: 8, fechaAcreditacion: '2019-11-14' }, actor);
  assert.deepEqual(mocks.spaceLookup, { id: 102, carreraId: 3 });
  assert.deepEqual(mocks.spaceLock, { id: 102, carreraId: 3, composicionBloqueadaAt: null });
});
