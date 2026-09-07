import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import cursadaRepository from '../src/repositories/cursadaRepository.js';
import profesorMateriaRepository from '../src/repositories/profesorMateriaRepository.js';
import calificacionService from '../src/services/calificacionService.js';
import cursadaService from '../src/services/cursadaService.js';
import { ROLES } from '../src/constants/roles.js';

const restorations: Array<() => void> = [];

function replaceMethod(target: Record<string, unknown>, key: string, replacement: unknown) {
  const original = target[key];
  target[key] = replacement;
  restorations.push(() => {
    if (original === undefined) delete target[key];
    else target[key] = original;
  });
}

afterEach(() => {
  while (restorations.length > 0) restorations.pop()?.();
});

test('el profesor obtiene únicamente sus materias del año lectivo solicitado', async () => {
  let filtroRecibido: unknown;
  replaceMethod(cursadaRepository, 'findDisponiblesParaCalificaciones', async (filtro: unknown) => {
    filtroRecibido = filtro;
    return [
      {
        cursadaId: 31,
        anioLectivo: 2026,
        materia: { id: 4, nombre: 'Didáctica' }
      }
    ];
  });

  const resultado = await (calificacionService as any).getCursadasDisponibles(
    2026,
    { id: 8, rol: ROLES.PROFESOR }
  );

  assert.deepEqual(filtroRecibido, { anioLectivo: 2026, profesorId: 8 });
  assert.deepEqual(resultado, [
    {
      cursadaId: 31,
      anioLectivo: 2026,
      materia: { id: 4, nombre: 'Didáctica' }
    }
  ]);
});

test('el administrativo obtiene todas las materias activas del año solicitado', async () => {
  let filtroRecibido: unknown;
  replaceMethod(cursadaRepository, 'findDisponiblesParaCalificaciones', async (filtro: unknown) => {
    filtroRecibido = filtro;
    return [];
  });

  const resultado = await (calificacionService as any).getCursadasDisponibles(
    2027,
    { id: 1, rol: ROLES.ADMINISTRATIVO }
  );

  assert.deepEqual(filtroRecibido, { anioLectivo: 2027 });
  assert.deepEqual(resultado, []);
});

test('un profesor ajeno a la cursada no puede consultar sus alumnos', async () => {
  let consultoInscriptos = false;
  replaceMethod(cursadaRepository, 'findById', async () => ({
    id: 31,
    materiaId: 4,
    docenteId: 99
  }));
  replaceMethod(profesorMateriaRepository, 'findByProfesorAndMateria', async () => null);
  replaceMethod(cursadaRepository, 'findInscriptosByCursadaId', async () => {
    consultoInscriptos = true;
    return [];
  });

  await assert.rejects(
    cursadaService.getInscriptosByCursada(
      31,
      { id: 8, rol: ROLES.PROFESOR } as any
    ),
    (error: any) => error.statusCode === 403
  );
  assert.equal(consultoInscriptos, false);
});
