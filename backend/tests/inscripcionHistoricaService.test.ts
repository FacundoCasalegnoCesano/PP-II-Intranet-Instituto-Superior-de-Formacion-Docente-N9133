import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { prisma } from '../src/config/prisma.js';
import { ROLES } from '../src/constants/roles.js';
import inscripcionHistoricaService from '../src/services/inscripcionHistoricaService.js';

const restorations: Array<() => void> = [];
function replace(target: any, key: string, value: any) {
  const original = target[key];
  target[key] = value;
  restorations.push(() => { if (original === undefined) delete target[key]; else target[key] = original; });
}
afterEach(() => { while (restorations.length) restorations.pop()?.(); });

const actor = { id: 4, rol: ROLES.ADMINISTRATIVO };
const oldYear = new Date().getFullYear() - 3;

function setupTransaction(tx: any) {
  replace(prisma.alumno, 'findUnique', async () => ({ idAlumno: 14, idCuenta: 20, usuario: { apellidoNombre: 'Alumna Demo', rol: 'ALUMNO' } }));
  replace(prisma, '$transaction', async (callback: (client: any) => Promise<unknown>) => callback(tx));
}

test('la inscripción histórica reutiliza la cursada exacta y conserva una matrícula y sus datos académicos', async () => {
  let updated: any;
  const tx = {
    $queryRaw: async () => [],
    cursada: { findUnique: async () => ({ id: 81, materiaId: 7, anioLectivo: oldYear, cursadaEspacioId: null, materia: { id: 7, nombre: 'Historia', carreraId: 3, espacioCurricularId: null } }) },
    inscripcionCarrera: { findFirst: async () => ({ id: 5 }) },
    inscripcionMateria: {
      findUnique: async () => ({ id: 99, alumnoId: 14, materiaId: 7, cicloLectivo: oldYear, cursadaId: null, estado: 'RECURSANDO', fechaBaja: null, modalidadElegida: 'SEMIPRESENCIAL' }),
      update: async ({ data }: any) => { updated = data; return { id: 99 }; }
    }
  };
  setupTransaction(tx);
  const result = await inscripcionHistoricaService.crear(81, 20, actor);
  assert.deepEqual(result, { idInscripcionMateria: 99, cursadaId: 81, alumnoId: 20 });
  assert.deepEqual(updated, { cursadaId: 81 });
});

test('una matrícula previa vinculada a otra cursada devuelve conflicto sin crear datos', async () => {
  let writes = 0;
  const tx = {
    $queryRaw: async () => [],
    cursada: { findUnique: async () => ({ id: 81, materiaId: 7, anioLectivo: oldYear, cursadaEspacioId: null, materia: { id: 7, nombre: 'Historia', carreraId: 3, espacioCurricularId: null } }) },
    inscripcionCarrera: { findFirst: async () => ({ id: 5 }) },
    inscripcionMateria: {
      findUnique: async () => ({ id: 99, cursadaId: 80, inscripcionEspacioId: null }),
      create: async () => { writes++; return { id: 100 }; },
      update: async () => { writes++; return { id: 99 }; }
    }
  };
  setupTransaction(tx);
  await assert.rejects(inscripcionHistoricaService.crear(81, 20, actor), /inscripción incompatible/);
  assert.equal(writes, 0);
});

test('inscribir a una materia componente crea padre e hijos del espacio de forma conjunta', async () => {
  const createdChildren: any[] = [];
  let createdParent: any;
  const courses = [
    { id: 81, materiaId: 7, materia: { id: 7, nombre: 'Historia' } },
    { id: 82, materiaId: 8, materia: { id: 8, nombre: 'Didáctica' } }
  ];
  const tx = {
    $queryRaw: async () => [],
    cursada: { findUnique: async () => ({ id: 81, materiaId: 7, anioLectivo: oldYear, cursadaEspacioId: 30, materia: { id: 7, nombre: 'Historia', carreraId: 3, espacioCurricularId: 50 } }) },
    inscripcionCarrera: { findFirst: async () => ({ id: 5 }) },
    cursadaEspacio: { findUnique: async () => ({ id: 30, anioLectivo: oldYear, componentes: courses }) },
    inscripcionEspacio: {
      findUnique: async () => null,
      create: async ({ data }: any) => { createdParent = { id: 44, ...data }; return createdParent; }
    },
    inscripcionMateria: {
      findMany: async () => [],
      create: async ({ data }: any) => { const row = { id: 60 + createdChildren.length, ...data }; createdChildren.push(row); return row; }
    }
  };
  setupTransaction(tx);
  const result = await inscripcionHistoricaService.crear(81, 20, actor);
  assert.equal(result.idInscripcionMateria, 60);
  assert.equal(createdParent.cursadaEspacioId, 30);
  assert.equal(createdParent.estado, 'ACTIVA');
  assert.equal(createdChildren.length, 2);
  assert.deepEqual(createdChildren.map((row) => [row.cursadaId, row.inscripcionEspacioId, row.estado]), [[81, 44, 'ACTIVA'], [82, 44, 'ACTIVA']]);
});
