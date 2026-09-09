import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import asistenciaRepository from '../src/repositories/asistenciaRepository.js';
import cursadaRepository from '../src/repositories/cursadaRepository.js';
import libroDeTemaRepository from '../src/repositories/libroDeTemaRepository.js';
import materiaRepository from '../src/repositories/materiaRepository.js';
import profesorMateriaRepository from '../src/repositories/profesorMateriaRepository.js';
import asistenciaService from '../src/services/asistenciaService.js';
import libroDeTemaService from '../src/services/libroDeTemaService.js';
import { ROLES } from '../src/constants/roles.js';

const restorations: Array<() => void> = [];

function replaceMethod(target: any, key: string, replacement: any): void {
  const original = target[key];
  target[key] = replacement;
  restorations.push(() => { target[key] = original; });
}

const currentCourse = {
  id: 12,
  materiaId: 14,
  anioLectivo: 2026,
  activo: true,
  docenteId: 12,
  materia: {
    profesorMaterias: [{ profesorId: 12, activo: true, fechaBaja: null }]
  }
};

afterEach(() => {
  while (restorations.length > 0) restorations.pop()?.();
});

test('asistencia exige que la fecha pertenezca al ciclo incluso para ADMINISTRATIVO', async () => {
  replaceMethod(cursadaRepository, 'findById', async () => ({ ...currentCourse, anioLectivo: 2025 }));
  replaceMethod(asistenciaRepository, 'upsertClase', async () => []);

  await assert.rejects(
    asistenciaService.cargarClase(
      { cursadaId: 12, fecha: '2026-08-24', asistencias: [] },
      { id: 1, rol: ROLES.ADMINISTRATIVO }
    ),
    (error: any) => error.statusCode === 400 && /año lectivo/i.test(error.message)
  );
});

test('asistencia docente no puede guardar una fecha fuera del año de su cursada', async () => {
  replaceMethod(cursadaRepository, 'findById', async () => currentCourse);
  replaceMethod(asistenciaRepository, 'upsertClase', async () => []);

  await assert.rejects(
    asistenciaService.cargarClase(
      { cursadaId: 12, fecha: '2025-08-24', asistencias: [] },
      { id: 12, rol: ROLES.PROFESOR }
    ),
    (error: any) => error.statusCode === 400 && /año lectivo/i.test(error.message)
  );
});

function stubProfesorMateria(): void {
  replaceMethod(materiaRepository, 'findById', async () => ({ id: 14, nombre: 'Álgebra' }));
  replaceMethod(profesorMateriaRepository, 'findByProfesorAndMateria', async () => ({
    profesorId: 12,
    materiaId: 14,
    activo: true,
    fechaBaja: null
  }));
  replaceMethod(cursadaRepository, 'getCursadaActivaByMateria', async () => currentCourse);
  replaceMethod(cursadaRepository, 'findById', async () => currentCourse);
}

test('libro de temas exige cursada actual y fecha del ciclo para el profesor', async () => {
  stubProfesorMateria();
  replaceMethod(libroDeTemaRepository, 'create', async (data: any) => data);

  await assert.rejects(
    libroDeTemaService.create({
      materiaId: 14,
      fecha: new Date('2025-08-24T00:00:00.000Z'),
      temaDesarrollado: 'Ecuaciones'
    }, { id: 12, rol: ROLES.PROFESOR }),
    (error: any) => error.statusCode === 400 && /año lectivo/i.test(error.message)
  );
});

test('libro de temas no permite mover un registro histórico al año actual', async () => {
  stubProfesorMateria();
  replaceMethod(libroDeTemaRepository, 'findById', async () => ({
    idLibroDeTema: 77,
    materiaId: 14,
    fecha: new Date('2025-08-24T00:00:00.000Z'),
    temaDesarrollado: 'Tema histórico'
  }));
  let writes = 0;
  replaceMethod(libroDeTemaRepository, 'update', async () => {
    writes += 1;
    return {};
  });

  await assert.rejects(
    libroDeTemaService.update(77, { fecha: new Date('2026-08-24T00:00:00.000Z') }, { id: 12, rol: ROLES.PROFESOR }),
    (error: any) => error.statusCode === 403
  );
  assert.equal(writes, 0);
});

test('ADMINISTRATIVO conserva la mutación del libro de temas', async () => {
  replaceMethod(materiaRepository, 'findById', async () => ({ id: 14, nombre: 'Álgebra' }));
  let writes = 0;
  replaceMethod(libroDeTemaRepository, 'create', async (data: any) => {
    writes += 1;
    return data;
  });

  await assert.doesNotReject(
    libroDeTemaService.create({
      materiaId: 14,
      fecha: new Date('2025-08-24T00:00:00.000Z'),
      temaDesarrollado: 'Ecuaciones'
    }, { id: 1, rol: ROLES.ADMINISTRATIVO })
  );
  assert.equal(writes, 1);
});
