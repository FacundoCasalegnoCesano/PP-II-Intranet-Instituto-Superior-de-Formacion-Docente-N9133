import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { app } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import userRepository from '../src/repositories/userRepository.js';
import { ROLES } from '../src/constants/roles.js';
import { generateAccessToken } from '../src/utils/jwt.js';
import estadoAcademicoService from '../src/services/estadoAcademicoService.js';

function token(rol: string): string {
  return generateAccessToken({ id: 99, email: 'test@instituto.edu.ar', dni: '12345678', nombre: 'Usuario Test', rol });
}

async function withServer<T>(operation: (baseUrl: string) => Promise<T>): Promise<T> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try { return await operation(`http://127.0.0.1:${port}`); }
  finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

test('GET /api/examenes/historicos devuelve una lista vacía al no haber registros', async () => {
  const originalUser = (userRepository as any).findAuthById;
  const originalSession = (prisma as any).sesion.findFirst;
  const originalFindMany = (prisma as any).inscripcionExamen.findMany;
  (userRepository as any).findAuthById = async () => ({ idUsuario: 99, email: 'test@instituto.edu.ar', dni: 12345678, apellidoNombre: 'Usuario Test', activo: true });
  (prisma as any).sesion.findFirst = async () => ({ id: 1 });
  (prisma as any).inscripcionExamen.findMany = async () => [];
  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/examenes/historicos`, { headers: { Authorization: `Bearer ${token(ROLES.ADMINISTRATIVO)}` } });
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).data, []);
    });
  } finally {
    (userRepository as any).findAuthById = originalUser;
    (prisma as any).sesion.findFirst = originalSession;
    (prisma as any).inscripcionExamen.findMany = originalFindMany;
  }
});

test('GET filtra por cuenta, carrera, materia y ciclo y presenta la fecha civil', async () => {
  const originalUser = (userRepository as any).findAuthById;
  const originalSession = (prisma as any).sesion.findFirst;
  const originalFindMany = (prisma as any).inscripcionExamen.findMany;
  let query: any;
  (userRepository as any).findAuthById = async () => ({ idUsuario: 99, email: 'test@instituto.edu.ar', dni: 12345678, apellidoNombre: 'Usuario Test', activo: true });
  (prisma as any).sesion.findFirst = async () => ({ id: 1 });
  (prisma as any).inscripcionExamen.findMany = async (args: any) => {
    query = args;
    return [{
      id: 7,
      historicoCicloLectivo: 2001,
      historicoFechaCivil: new Date('2001-11-14T00:00:00.000Z'),
      notaFinal: 5,
      alumno: { idCuenta: 99, usuario: { apellidoNombre: 'Lucía Fernández' } },
      mesa: {
        version: 3,
        libroExamen: 'Libro 2',
        folioExamen: '18',
        materia: { id: 8, nombre: 'Historia', carrera: { id: 4, nombre: 'Profesorado' } }
      }
    }];
  };
  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/examenes/historicos?alumnoId=99&carreraId=4&materiaId=8&cicloLectivo=2001`, { headers: { Authorization: `Bearer ${token(ROLES.ADMINISTRATIVO)}` } });
      assert.equal(response.status, 200);
      assert.deepEqual(query.where.alumno, { idCuenta: 99 });
      assert.deepEqual(query.where.mesa, { origen: 'HISTORICA', materia: { carreraId: 4 } });
      assert.equal(query.where.historicoMateriaId, 8);
      assert.equal(query.where.historicoCicloLectivo, 2001);
      assert.deepEqual((await response.json()).data, [{
        id: 7,
        alumnoId: 99,
        nombreAlumno: 'Lucía Fernández',
        carreraId: 4,
        nombreCarrera: 'Profesorado',
        materiaId: 8,
        nombreMateria: 'Historia',
        cicloLectivo: 2001,
        cursadaId: null,
        inscripcionMateriaId: null,
        fechaExamen: '2001-11-14',
        notaFinal: 5,
        libro: 'Libro 2',
        folio: '18',
        version: 3
      }]);
    });
  } finally {
    (userRepository as any).findAuthById = originalUser;
    (prisma as any).sesion.findFirst = originalSession;
    (prisma as any).inscripcionExamen.findMany = originalFindMany;
  }
});

test('POST conserva el día civil, permite nota insuficiente y crea mesa, resultado y auditoría en transacción', async () => {
  const originals = {
    user: (userRepository as any).findAuthById,
    session: (prisma as any).sesion.findFirst,
    alumno: (prisma as any).alumno.findUnique,
    materia: (prisma as any).materia.findUnique,
    transaction: (prisma as any).$transaction
  };
  let mesaData: any;
  let enrollmentData: any;
  let auditData: any;
  (userRepository as any).findAuthById = async () => ({ idUsuario: 99, email: 'test@instituto.edu.ar', dni: 12345678, apellidoNombre: 'Usuario Test', activo: true });
  (prisma as any).sesion.findFirst = async () => ({ id: 1 });
  (prisma as any).alumno.findUnique = async () => ({ idAlumno: 41, idCuenta: 99, usuario: { rol: 'ALUMNO', apellidoNombre: 'Lucía Fernández' } });
  (prisma as any).materia.findUnique = async () => ({ id: 8, carreraId: 4, espacioCurricularId: null, nombre: 'Historia', notaMinima: 6, carrera: { id: 4, nombre: 'Profesorado' } });
  const tx = {
    $queryRaw: async () => [],
    cursada: { findUnique: async () => ({ id: 88, materiaId: 8, anioLectivo: 2001, cursadaEspacioId: null, materia: { id: 8, carreraId: 4, espacioCurricularId: null } }) },
    inscripcionCarrera: { findFirst: async () => ({ id: 3 }) },
    alumno: { findUnique: async () => ({ idAlumno: 41, usuario: { apellidoNombre: 'Lucía Fernández' } }) },
    inscripcionMateria: {
      findUnique: async () => null,
      create: async ({ data }: any) => ({ id: 56, ...data })
    },
    materia: { findUnique: async () => ({ id: 8, carreraId: 4, espacioCurricularId: null, nombre: 'Historia', notaMinima: 6, carrera: { id: 4, nombre: 'Profesorado' } }) },
    mesa: { create: async ({ data }: any) => { mesaData = data; return { id: 12, version: 0, ...data }; } },
    inscripcionExamen: { create: async ({ data }: any) => { enrollmentData = data; return { id: 21, ...data }; } },
    mesaResultadoAuditoria: { create: async ({ data }: any) => { auditData = data; return { id: 1, ...data }; } }
  };
  (prisma as any).$transaction = async (work: (client: any) => Promise<unknown>, options: any) => {
    assert.equal(options.isolationLevel, 'Serializable');
    return work(tx);
  };
  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/examenes/historicos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token(ROLES.ADMINISTRATIVO)}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ alumnoId: 99, cursadaId: 88, fechaExamen: '2001-11-14', notaFinal: 4 })
      });
      assert.equal(response.status, 201);
      const result = await response.json();
      assert.equal(result.data.fechaExamen, '2001-11-14');
      assert.equal(result.data.notaFinal, 4);
      assert.equal(mesaData.origen, 'HISTORICA');
      assert.equal(mesaData.estadoMesa, 'FINALIZADA');
      assert.equal(mesaData.fecha, null);
      assert.equal(mesaData.fechaCivil.toISOString(), '2001-11-14T00:00:00.000Z');
      assert.equal(mesaData.cicloLectivo, 2001);
      assert.equal(enrollmentData.alumnoId, 41);
      assert.equal(enrollmentData.inscripcionMateriaId, 56);
      assert.equal(enrollmentData.historicoMateriaId, 8);
      assert.equal(enrollmentData.historicoFechaCivil.toISOString(), '2001-11-14T00:00:00.000Z');
      assert.equal(enrollmentData.aprobado, false);
      assert.equal(enrollmentData.ausentePublicado, false);
      assert.equal(auditData.accion, 'CIERRE');
      assert.equal(auditData.notaAnterior, null);
      assert.equal(auditData.notaNueva, 4);
    });
  } finally {
    (userRepository as any).findAuthById = originals.user;
    (prisma as any).sesion.findFirst = originals.session;
    (prisma as any).alumno.findUnique = originals.alumno;
    (prisma as any).materia.findUnique = originals.materia;
    (prisma as any).$transaction = originals.transaction;
  }
});

test('POST convierte la restricción unique de deduplicación en conflicto y no hace upsert', async () => {
  const originals = {
    user: (userRepository as any).findAuthById,
    session: (prisma as any).sesion.findFirst,
    alumno: (prisma as any).alumno.findUnique,
    materia: (prisma as any).materia.findUnique,
    transaction: (prisma as any).$transaction
  };
  (userRepository as any).findAuthById = async () => ({ idUsuario: 99, email: 'test@instituto.edu.ar', dni: 12345678, apellidoNombre: 'Usuario Test', activo: true });
  (prisma as any).sesion.findFirst = async () => ({ id: 1 });
  (prisma as any).alumno.findUnique = async () => ({ idAlumno: 41, idCuenta: 99, usuario: { rol: 'ALUMNO', apellidoNombre: 'Lucía Fernández' } });
  (prisma as any).materia.findUnique = async () => ({ id: 8, carreraId: 4, nombre: 'Historia', notaMinima: 6, carrera: { id: 4, nombre: 'Profesorado' } });
  const tx = {
    $queryRaw: async () => [],
    cursada: { findUnique: async () => ({ id: 88, materiaId: 8, anioLectivo: 2001, cursadaEspacioId: null, materia: { id: 8, carreraId: 4, espacioCurricularId: null } }) },
    inscripcionCarrera: { findFirst: async () => ({ id: 3 }) },
    alumno: { findUnique: async () => ({ idAlumno: 41, usuario: { apellidoNombre: 'Lucía Fernández' } }) },
    inscripcionMateria: { findUnique: async () => null, create: async ({ data }: any) => ({ id: 56, ...data }) },
    materia: { findUnique: async () => ({ id: 8, carreraId: 4, espacioCurricularId: null, nombre: 'Historia', notaMinima: 6, carrera: { id: 4, nombre: 'Profesorado' } }) },
    mesa: { create: async () => ({ id: 12 }) },
    inscripcionExamen: { create: async () => { throw Object.assign(new Error('duplicate'), { code: 'P2002', meta: { target: 'inscripcion_examen_historico_dedupe' } }); } },
    mesaResultadoAuditoria: { create: async () => assert.fail('no debe auditar una creación duplicada') }
  };
  (prisma as any).$transaction = async (work: (client: any) => Promise<unknown>) => work(tx);
  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/examenes/historicos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token(ROLES.ADMINISTRATIVO)}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ alumnoId: 99, cursadaId: 88, fechaExamen: '2001-11-14', notaFinal: 9 })
      });
      assert.equal(response.status, 409);
      assert.match((await response.json()).message, /Ya existe/);
    });
  } finally {
    (userRepository as any).findAuthById = originals.user;
    (prisma as any).sesion.findFirst = originals.session;
    (prisma as any).alumno.findUnique = originals.alumno;
    (prisma as any).materia.findUnique = originals.materia;
    (prisma as any).$transaction = originals.transaction;
  }
});

test('PATCH requiere versión actual, corrige nota/aprobación y audita los valores anteriores y nuevos', async () => {
  const originals = {
    user: (userRepository as any).findAuthById,
    session: (prisma as any).sesion.findFirst,
    transaction: (prisma as any).$transaction
  };
  const originalGetApproved = estadoAcademicoService.getMateriasAprobadasSet;
  let mesaUpdate: any;
  let enrollmentUpdate: any;
  let auditData: any;
  let compositionLatch: any;
  estadoAcademicoService.getMateriasAprobadasSet = async () => new Set([9]);
  (userRepository as any).findAuthById = async () => ({ idUsuario: 99, email: 'test@instituto.edu.ar', dni: 12345678, apellidoNombre: 'Usuario Test', activo: true });
  (prisma as any).sesion.findFirst = async () => ({ id: 1 });
  const existingRow = {
    id: 21,
    mesaId: 12,
    alumnoId: 41,
    historicoMateriaId: 8,
    historicoCicloLectivo: 2001,
    historicoFechaCivil: new Date('2001-11-14T00:00:00.000Z'),
    notaFinal: 4,
    ausentePublicado: false,
    alumno: { idCuenta: 99, usuario: { apellidoNombre: 'Lucía Fernández' } },
    mesa: { id: 12, origen: 'HISTORICA', version: 3, libroExamen: 'L1', folioExamen: 'F1', materia: { id: 8, carreraId: 4, espacioCurricularId: 30, nombre: 'Historia', notaMinima: 6, carrera: { id: 4, nombre: 'Profesorado' } } }
  };
  const tx = {
    $queryRaw: async () => [],
    espacioCurricular: {
      findFirst: async () => ({ composicionBloqueadaAt: null, materias: [{ id: 8 }, { id: 9 }] }),
      updateMany: async (args: any) => { compositionLatch = args; return { count: 1 }; }
    },
    inscripcionExamen: {
      findUnique: async () => existingRow,
      update: async ({ data }: any) => { enrollmentUpdate = data; return { ...existingRow, ...data }; }
    },
    mesa: { updateMany: async (args: any) => { mesaUpdate = args; return { count: 1 }; } },
    mesaResultadoAuditoria: { create: async ({ data }: any) => { auditData = data; return { id: 4 }; } }
  };
  (prisma as any).$transaction = async (work: (client: any) => Promise<unknown>, options: any) => {
    assert.equal(options.isolationLevel, 'Serializable');
    return work(tx);
  };
  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/examenes/historicos/21`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token(ROLES.ADMINISTRATIVO)}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ notaFinal: 8, libro: null, folio: null, motivo: 'Rectificación del acta', expectedVersion: 3 })
      });
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.data.version, 4);
      assert.equal(result.data.notaFinal, 8);
      assert.equal(result.data.libro, null);
      assert.equal(result.data.folio, null);
      assert.deepEqual(mesaUpdate.where, { id: 12, origen: 'HISTORICA', version: 3 });
      assert.deepEqual(enrollmentUpdate.notaFinal, 8);
      assert.equal(enrollmentUpdate.aprobado, true);
      assert.equal(mesaUpdate.data.libroExamen, null);
      assert.equal(mesaUpdate.data.folioExamen, null);
      assert.equal(auditData.accion, 'CORRECCION');
      assert.equal(auditData.notaAnterior, 4);
      assert.equal(auditData.notaNueva, 8);
      assert.equal(auditData.motivo, 'Rectificación del acta');
      assert.deepEqual(compositionLatch.where, { id: 30, carreraId: 4, composicionBloqueadaAt: null });
      assert.ok(compositionLatch.data.composicionBloqueadaAt instanceof Date);
    });
  } finally {
    (userRepository as any).findAuthById = originals.user;
    (prisma as any).sesion.findFirst = originals.session;
    (prisma as any).$transaction = originals.transaction;
    estadoAcademicoService.getMateriasAprobadasSet = originalGetApproved;
  }
});

test('PATCH responde conflicto y no actualiza inscripción cuando la versión cambió', async () => {
  const originals = {
    user: (userRepository as any).findAuthById,
    session: (prisma as any).sesion.findFirst,
    transaction: (prisma as any).$transaction
  };
  let enrollmentUpdated = false;
  (userRepository as any).findAuthById = async () => ({ idUsuario: 99, email: 'test@instituto.edu.ar', dni: 12345678, apellidoNombre: 'Usuario Test', activo: true });
  (prisma as any).sesion.findFirst = async () => ({ id: 1 });
  const tx = {
    $queryRaw: async () => [],
    inscripcionExamen: {
      findUnique: async () => ({ id: 21, mesaId: 12, historicoMateriaId: 8, historicoFechaCivil: new Date('2001-11-14'), notaFinal: 4, alumno: { idCuenta: 99, usuario: { apellidoNombre: 'Lucía Fernández' } }, mesa: { origen: 'HISTORICA', version: 4, materia: { id: 8, nombre: 'Historia', notaMinima: 6, carrera: { id: 4, nombre: 'Profesorado' } } } }),
      update: async () => { enrollmentUpdated = true; return {}; }
    },
    mesa: { updateMany: async () => ({ count: 1 }) },
    mesaResultadoAuditoria: { create: async () => assert.fail('no debe auditar una corrección obsoleta') }
  };
  (prisma as any).$transaction = async (work: (client: any) => Promise<unknown>) => work(tx);
  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/examenes/historicos/21`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token(ROLES.ADMINISTRATIVO)}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ notaFinal: 8, libro: null, folio: null, motivo: 'Rectificación', expectedVersion: 3 })
      });
      assert.equal(response.status, 409);
      assert.equal(enrollmentUpdated, false);
    });
  } finally {
    (userRepository as any).findAuthById = originals.user;
    (prisma as any).sesion.findFirst = originals.session;
    (prisma as any).$transaction = originals.transaction;
  }
});

test('profesor no puede consultar mesas históricas y fecha inválida se rechaza en la frontera', async () => {
  const originalUser = (userRepository as any).findAuthById;
  const originalSession = (prisma as any).sesion.findFirst;
  const originalFindMany = (prisma as any).inscripcionExamen.findMany;
  (userRepository as any).findAuthById = async () => ({ idUsuario: 99, email: 'test@instituto.edu.ar', dni: 12345678, apellidoNombre: 'Usuario Test', activo: true });
  (prisma as any).sesion.findFirst = async () => ({ id: 1 });
  (prisma as any).inscripcionExamen.findMany = async () => assert.fail('el profesor no debe llegar al servicio');
  try {
    await withServer(async (baseUrl) => {
      const forbidden = await fetch(`${baseUrl}/api/examenes/historicos`, { headers: { Authorization: `Bearer ${token(ROLES.PROFESOR)}` } });
      assert.equal(forbidden.status, 403);
      const invalid = await fetch(`${baseUrl}/api/examenes/historicos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token(ROLES.ADMINISTRATIVO)}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ alumnoId: 99, cursadaId: 88, fechaExamen: '2001-02-29', notaFinal: 5 })
      });
      assert.equal(invalid.status, 400);
    });
  } finally {
    (userRepository as any).findAuthById = originalUser;
    (prisma as any).sesion.findFirst = originalSession;
    (prisma as any).inscripcionExamen.findMany = originalFindMany;
  }
});
