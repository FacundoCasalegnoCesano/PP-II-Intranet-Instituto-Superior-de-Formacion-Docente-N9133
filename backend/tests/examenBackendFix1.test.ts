import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { parse } from 'yaml';

import examenRepository from '../src/repositories/examenRepository.js';
import examenService from '../src/services/examenService.js';
import estadoAcademicoService from '../src/services/estadoAcademicoService.js';
import alumnoRepository from '../src/repositories/alumnoRepository.js';
import { prisma } from '../src/config/prisma.js';
import { ROLES } from '../src/constants/roles.js';
import { notaExamenSchema } from '../src/validations/examenValidation.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const restorations: Array<() => void> = [];

function replaceMethod(target: any, key: string, replacement: any) {
  const original = target[key];
  target[key] = replacement;
  restorations.push(() => { target[key] = original; });
}

function useTransaction(tx: any) {
  replaceMethod(prisma as any, '$transaction', async (work: (client: any) => Promise<unknown>) => work(tx));
}

function transactionClient(overrides: Record<string, any> = {}) {
  let lockAcquired = false;
  const mesa = {
    id: 9,
    version: 3,
    estadoMesa: 'EN_PROCESO',
    publicadaEn: null,
    materia: { notaMinima: 6 },
    tribunales: [
      { id: 1, profesorId: 20, rolTribunal: 'PRESIDENTE' },
      { id: 2, profesorId: 21, rolTribunal: 'VOCAL' },
      { id: 3, profesorId: 22, rolTribunal: 'VOCAL' }
    ],
    inscripciones: [{ id: 30, notaBorrador: 8, ausenteBorrador: false }]
  };
  const mesaValue = { ...mesa, ...(overrides.mesa ?? {}) };
  const defaultInscripcionExamen = {
    findUnique: async () => ({ id: 30, mesaId: mesaValue.id, alumnoId: 42, fechaBaja: new Date() }),
    findFirst: async () => ({ id: 30, notaBorrador: null, ausenteBorrador: false }),
    update: async ({ where, data }: any) => ({ id: where.id, ...data, alumno: { usuario: { idUsuario: 13 } } }),
    create: async ({ data }: any) => ({ id: 30, ...data })
  };
  const tx: any = {
    $queryRaw: async () => {
      lockAcquired = true;
      return [];
    },
    mesa: {
      findUnique: async () => mesaValue,
      update: async ({ data }: any) => ({ id: mesaValue.id, version: data?.version?.increment ? mesaValue.version + data.version.increment : mesaValue.version })
    },
    mesaTribunal: {
      findUnique: async () => ({ mesaId: mesaValue.id }),
      delete: async () => ({})
    },
    inscripcionExamen: { ...defaultInscripcionExamen, ...(overrides.inscripcionExamen ?? {}) },
    mesaResultadoAuditoria: { create: async () => ({}) },
  };
  useTransaction(tx);
  return { tx, mesa, wasLocked: () => lockAcquired };
}

afterEach(() => {
  while (restorations.length > 0) restorations.pop()?.();
});

test('revalida dentro del lock que el profesor siga integrando el tribunal al guardar', async () => {
  transactionClient({
    mesa: {
      id: 9,
      version: 3,
      estadoMesa: 'EN_PROCESO',
      publicadaEn: null,
      materia: { notaMinima: 6 },
      tribunales: [{ id: 1, profesorId: 99, rolTribunal: 'VOCAL' }]
    }
  });

  await assert.rejects(
    examenRepository.registrarNota(9, 42, 8, { id: 20, rol: ROLES.PROFESOR } as any),
    (error: any) => error.statusCode === 403
  );
});

test('revalida dentro del lock que el profesor siga siendo presidente al cerrar', async () => {
  const { wasLocked } = transactionClient({
    mesa: {
      id: 9,
      version: 3,
      estadoMesa: 'EN_PROCESO',
      publicadaEn: null,
      materia: { notaMinima: 6 },
      tribunales: [
        { id: 1, profesorId: 99, rolTribunal: 'PRESIDENTE' },
        { id: 2, profesorId: 20, rolTribunal: 'VOCAL' },
        { id: 3, profesorId: 22, rolTribunal: 'VOCAL' }
      ],
      inscripciones: [{ id: 30, notaBorrador: 8, ausenteBorrador: false }]
    }
  });

  await assert.rejects(
    examenRepository.cerrarMesa(9, { id: 20, rol: ROLES.PROFESOR } as any, 3),
    (error: any) => error.statusCode === 403
  );
  assert.equal(wasLocked(), true);
});

test('reactivar una inscripción exige tribunal completo dentro del lock', async () => {
  transactionClient({
    mesa: {
      id: 9,
      version: 3,
      estadoMesa: 'ABIERTA',
      publicadaEn: null,
      tribunales: [{ id: 1, profesorId: 20, rolTribunal: 'PRESIDENTE' }]
    }
  });

  await assert.rejects(
    examenRepository.reactivarInscripcion(30, 'REGULAR', 3),
    (error: any) => error.statusCode === 409 && /tribunal/i.test(error.message)
  );
});

test('las tres mutaciones de nómina quedan bloqueadas durante una reapertura', async () => {
  const reopenedMesa = {
    id: 9,
    version: 3,
    estadoMesa: 'EN_PROCESO',
    publicadaEn: new Date('2026-09-10T12:00:00.000Z'),
    tribunales: [
      { id: 1, profesorId: 20, rolTribunal: 'PRESIDENTE' },
      { id: 2, profesorId: 21, rolTribunal: 'VOCAL' },
      { id: 3, profesorId: 22, rolTribunal: 'VOCAL' }
    ]
  };

  transactionClient({ mesa: reopenedMesa });
  await assert.rejects(examenRepository.inscribirAlumno(9, 42, 'REGULAR', 3), (error: any) => error.statusCode === 409);

  transactionClient({
    mesa: reopenedMesa,
    inscripcionExamen: {
      findUnique: async () => ({ id: 30, mesaId: 9, alumnoId: 42, fechaBaja: new Date() })
    }
  });
  await assert.rejects(examenRepository.reactivarInscripcion(30, 'REGULAR', 3), (error: any) => error.statusCode === 409);

  transactionClient({ mesa: reopenedMesa });
  await assert.rejects(examenRepository.desinscribirAlumno(9, 42, 3), (error: any) => error.statusCode === 409);
});

function rawMesa() {
  return {
    id: 9,
    materiaId: 7,
    fecha: new Date('2026-09-01T12:00:00.000Z'),
    tipoExamen: 'ORAL',
    llamado: 1,
    estadoMesa: 'EN_PROCESO',
    version: 3,
    publicadaEn: new Date('2026-09-10T12:00:00.000Z'),
    motivoReapertura: 'Corrección',
    materia: { id: 7, nombre: 'Didáctica', notaMinima: 7, carrera: { id: 2, nombre: 'Inicial' } },
    tribunales: [{ id: 1, profesorId: 20, rolTribunal: 'PRESIDENTE', profesor: { idUsuario: 20, apellidoNombre: 'Docente', email: 'docente@example.com', domicilio: 'no-wire' } }],
    inscripciones: [{
      id: 30,
      mesaId: 9,
      alumnoId: 42,
      fechaBaja: null,
      condicion: 'REGULAR',
      notaFinal: 8,
      aprobado: true,
      notaBorrador: 4,
      ausenteBorrador: false,
      ausentePublicado: false,
      alumno: {
        idAlumno: 42,
        domicilio: 'no-wire',
        usuario: { idUsuario: 13, apellidoNombre: 'Lucía', email: 'lucia@example.com', dni: 30111222 }
      }
    }]
  };
}

test('mapea un DTO explícito sin datos Prisma para administrativo, tribunal y alumno', async () => {
  const raw = rawMesa();
  replaceMethod(examenRepository, 'findExamenById', async () => raw);

  const admin = await examenService.getExamenById(9, { id: 1, rol: ROLES.ADMINISTRATIVO });
  const profesor = await examenService.getExamenById(9, { id: 20, rol: ROLES.PROFESOR });
  replaceMethod(alumnoRepository, 'findByUsuarioId', async () => ({ idAlumno: 42 }));
  const alumno = await examenService.getExamenById(9, { id: 13, rol: ROLES.ALUMNO });

  for (const detail of [admin, profesor, alumno]) {
    assert.equal(JSON.stringify(detail).includes('idAlumno'), false);
    assert.equal(JSON.stringify(detail).includes('domicilio'), false);
    assert.equal(JSON.stringify(detail).includes('notaBorrador'), false);
  }
  assert.deepEqual((admin as any).inscripciones[0].alumno, {
    idUsuario: 13,
    apellidoNombre: 'Lucía',
    email: 'lucia@example.com',
    dni: 30111222
  });
  assert.equal((admin as any).inscripciones[0].nota, 4);
  assert.equal((profesor as any).inscripciones[0].nota, 4);
  assert.deepEqual((alumno as any).inscripciones, [{
    id: 30,
    mesaId: 9,
    condicion: 'REGULAR',
    estadoResultado: 'EN_REVISION',
    nota: null,
    aprobado: null,
    notaMinima: 7
  }]);
});

test('normaliza notaMinima nula a 6 en el detalle público de una mesa', async () => {
  const raw = { ...rawMesa(), materia: { ...rawMesa().materia, notaMinima: null } };
  replaceMethod(examenRepository, 'findExamenById', async () => raw);

  const detail = await examenService.getExamenById(9, { id: 1, rol: ROLES.ADMINISTRATIVO });

  assert.equal((detail as any).materia.notaMinima, 6);
});

test('OpenAPI y Joi expresan exactamente los campos mutables y la carga XOR', () => {
  const document = parse(readFileSync(resolve(process.cwd(), 'openapi.yaml'), 'utf8'));
  const updateProperties = Object.keys(document.components.schemas.ExamenUpdateRequest.properties).sort();
  assert.deepEqual(updateProperties, ['expectedVersion', 'fecha', 'folioExamen', 'libroExamen', 'llamado', 'tipoExamen']);
  const updateSchema = document.components.schemas.ExamenUpdateRequest;
  assert.equal(updateSchema.minProperties, 1);
  assert.equal(Object.keys({}).length >= updateSchema.minProperties, false);
  const publicAlumno = document.components.schemas.AlumnoResultadoPublico;
  assert.deepEqual(Object.keys(publicAlumno.properties).sort(), ['apellidoNombre', 'dni', 'email', 'idUsuario']);
  assert.equal(publicAlumno.additionalProperties, false);
  for (const forbidden of ['idAlumno', 'domicilio', 'notaBorrador', 'ausenteBorrador']) {
    assert.equal(Object.prototype.hasOwnProperty.call(publicAlumno.properties, forbidden), false);
  }
  const acta = document.components.schemas.InscriptoResultado;
  assert.equal(acta.additionalProperties, false);
  assert.equal(acta.properties.alumno.$ref, '#/components/schemas/AlumnoResultadoPublico');
  const detail = document.components.schemas.MesaDetail;
  assert.equal(document.components.schemas.MesaDetailResponse.properties.data.$ref, '#/components/schemas/MesaDetail');
  assert.equal(detail.additionalProperties, false);
  assert.deepEqual(
    detail.properties.inscripciones.items.oneOf.map((item: any) => item.$ref).sort(),
    ['#/components/schemas/InscriptoResultado', '#/components/schemas/InscriptoResultadoAlumno'].sort()
  );
  assert.equal(document.components.schemas.CalificacionRequest.oneOf.length, 2);
  assert.equal(notaExamenSchema.validate({ alumnoId: 13, nota: 0 }).error, undefined);
  assert.equal(notaExamenSchema.validate({ alumnoId: 13, ausente: true }).error, undefined);
  assert.ok(notaExamenSchema.validate({ alumnoId: 13, nota: 0, ausente: false }).error);
  assert.ok(notaExamenSchema.validate({ alumnoId: 13, nota: 0, ausente: true }).error);
  assert.ok(notaExamenSchema.validate({ alumnoId: 13 }).error);
});

test('el promedio general excluye inscripciones de examen dadas de baja', async () => {
  let receivedWhere: unknown;
  replaceMethod(alumnoRepository, 'findByUsuarioId', async () => ({ idAlumno: 42 }));
  replaceMethod((prisma as any).inscripcionExamen, 'findMany', async ({ where }: any) => {
    receivedWhere = where;
    const registros = [
      {
        notaFinal: 8,
        fechaBaja: null,
        mesa: { materia: { id: 7, nombre: 'Activa', carreraId: 1 } }
      },
      {
        notaFinal: 10,
        fechaBaja: new Date('2026-08-01T00:00:00.000Z'),
        mesa: { materia: { id: 8, nombre: 'Dada de baja', carreraId: 1 } }
      }
    ];
    return where.fechaBaja === null ? registros.filter(registro => registro.fechaBaja === null) : registros;
  });
  replaceMethod((prisma as any).homologacion, 'findMany', async () => []);
  replaceMethod((prisma as any).inscripcionMateria, 'findMany', async () => []);

  const resultado = await estadoAcademicoService.getPromedioGeneral(
    13,
    { id: 1, rol: ROLES.ADMINISTRATIVO }
  );

  assert.deepEqual(receivedWhere, {
    alumnoId: 42,
    aprobado: true,
    notaFinal: { not: null },
    fechaBaja: null
  });
  assert.equal(resultado.promedioGeneral, 8);
  assert.equal(resultado.cantidadMateriasAprobadas, 1);
  assert.deepEqual(resultado.materias, [{ materiaId: 7, nombre: 'Activa', nota: 8, via: 'EXAMEN_FINAL' }]);
});

test('las materias aprobadas usan el snapshot publicado de inscripciones activas', async () => {
  let receivedWhere: unknown;
  replaceMethod((prisma as any).inscripcionExamen, 'findMany', async ({ where }: any) => {
    receivedWhere = where;
    return [];
  });
  replaceMethod((prisma as any).homologacion, 'findMany', async () => []);

  await estadoAcademicoService.getMateriasAprobadasSet(42, new Map());

  assert.deepEqual(receivedWhere, { alumnoId: 42, aprobado: true, fechaBaja: null });
});
