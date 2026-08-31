import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import materiaRepository from '../src/repositories/materiaRepository.js';
import inscripcionMateriaController from '../src/controllers/inscripcionMateriaController.js';
import examenController from '../src/controllers/examenController.js';
import inscripcionMateriaService from '../src/services/inscripcionMateriaService.js';
import examenService from '../src/services/examenService.js';
import { ROLES } from '../src/constants/roles.js';
import { prisma } from '../src/config/prisma.js';

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

test('la consulta de disponibilidad de materias no carga horarios estructurados', async () => {
  let consulta: any;
  replaceMethod(prisma.materia as unknown as Record<string, unknown>, 'findMany', async (args: any) => {
    consulta = args;
    return [];
  });
  replaceMethod(prisma.inscripcionMateria as unknown as Record<string, unknown>, 'findMany', async () => []);
  replaceMethod(prisma.calificacion as unknown as Record<string, unknown>, 'findMany', async () => []);

  await materiaRepository.getMateriasDisponibles(4, [2], 2026);
  assert.deepEqual(consulta.include.cursadas, { where: { activo: true } });
});

test('un alumno se inscribe a una materia con la identidad del JWT y modalidadElegida', async () => {
  let recibido: any;
  replaceMethod(inscripcionMateriaService, 'inscribirAlumno', async (data: any, user: any) => {
    recibido = { data, user };
    return { id: 1 };
  });
  const req: any = {
    user: { id: 10, rol: ROLES.ALUMNO },
    body: { alumnoId: 999, materiaId: 7, modalidadElegida: 'SEMIPRESENCIAL' }
  };
  let respuesta: any;
  await inscripcionMateriaController.inscribirAlumno(req, {
    status: () => ({ json: (payload: any) => { respuesta = payload; } })
  } as any, (error: unknown) => { throw error; });

  assert.equal(recibido.data.alumnoId, 10);
  assert.equal(recibido.data.modalidadElegida, 'SEMIPRESENCIAL');
  assert.equal(respuesta.success, true);
});

test('el cambio administrativo de modalidad usa modalidadElegida', async () => {
  let recibido: any;
  replaceMethod(inscripcionMateriaService, 'cambiarModalidad', async (...args: any[]) => {
    recibido = args;
    return { id: 1 };
  });
  const user = { id: 1, rol: ROLES.ADMINISTRATIVO };
  await inscripcionMateriaController.cambiarModalidad({
    params: { id: '1' }, body: { modalidadElegida: 'LIBRE' }, user
  } as any, { status: () => ({ json: () => undefined }), json: () => undefined } as any, (error: unknown) => { throw error; });

  assert.deepEqual(recibido, [1, 'LIBRE', user]);
});

test('un alumno se inscribe y desinscribe de una mesa con la identidad del JWT', async () => {
  const llamadas: any[] = [];
  replaceMethod(examenService, 'inscribirAlumno', async (...args: any[]) => {
    llamadas.push(['alta', args]);
    return { id: 1 };
  });
  replaceMethod(examenService, 'desinscribirAlumno', async (...args: any[]) => {
    llamadas.push(['baja', args]);
    return { id: 1 };
  });
  const user = { id: 10, rol: ROLES.ALUMNO };
  const response = { status: () => ({ json: () => undefined }), json: () => undefined } as any;
  const next = (error: unknown) => { throw error; };

  await examenController.inscribirAlumno({ params: { examenId: '3' }, body: { alumnoId: 999, condicion: 'LIBRE' }, user } as any, response, next);
  await examenController.desinscribirAlumno({ params: { examenId: '3' }, body: { alumnoId: 999 }, user } as any, response, next);

  assert.deepEqual(llamadas, [
    ['alta', [3, 10, 'LIBRE', user]],
    ['baja', [3, 10, user]]
  ]);
});
