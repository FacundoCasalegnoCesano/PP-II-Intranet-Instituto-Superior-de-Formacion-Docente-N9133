import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import cursadaRepository from '../src/repositories/cursadaRepository.js';
import materiaRepository from '../src/repositories/materiaRepository.js';
import cursadaService from '../src/services/cursadaService.js';
import { ROLES } from '../src/constants/roles.js';

const restorations: Array<() => void> = [];

function replaceMethod(target: any, key: string, replacement: any) {
  const original = target[key];
  target[key] = replacement;
  restorations.push(() => { target[key] = original; });
}

afterEach(() => {
  while (restorations.length > 0) restorations.pop()?.();
});

function existingCommonCourse() {
  return {
    id: 1,
    materiaId: 10,
    anioLectivo: 2026,
    periodo: 'ANUAL',
    docenteId: null,
    activo: true,
    materia: { id: 10, nombre: 'Materia común', carreraId: 9 },
    horarios: []
  };
}

test('update rechaza cambiar una cursada común a componente de un espacio activo', async () => {
  replaceMethod(cursadaRepository, 'findById', async () => existingCommonCourse());
  replaceMethod(materiaRepository, 'findById', async (id: number) => id === 20
    ? { id, nombre: 'Componente', espacioCurricular: { id: 7, nombre: 'Espacio Integrador', activo: true } }
    : { id, nombre: 'Materia común', espacioCurricular: null });
  let updateCalls = 0;
  replaceMethod(cursadaRepository, 'update', async () => { updateCalls += 1; });

  await assert.rejects(
    cursadaService.updateCursada(1, { materiaId: 20 }, { id: 3, rol: ROLES.ADMINISTRATIVO }),
    (error: any) => error.statusCode === 409 && /Espacio Integrador/.test(error.message)
  );
  assert.equal(updateCalls, 0);
});

test('update permite cambiar una cursada común a otra materia común', async () => {
  replaceMethod(cursadaRepository, 'findById', async () => existingCommonCourse());
  replaceMethod(materiaRepository, 'findById', async (id: number) => ({
    id,
    nombre: 'Otra materia común',
    espacioCurricular: null
  }));
  let updateCalls = 0;
  replaceMethod(cursadaRepository, 'update', async (id: number, data: { materiaId?: number }) => {
    updateCalls += 1;
    return { id, ...data };
  });

  const updated = await cursadaService.updateCursada(
    1,
    { materiaId: 11 },
    { id: 3, rol: ROLES.ADMINISTRATIVO }
  );

  assert.deepEqual(updated, { id: 1, materiaId: 11 });
  assert.equal(updateCalls, 1);
});
