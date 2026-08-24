import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import estadoAcademicoService from '../src/services/estadoAcademicoService.js';
import cursadaRepository from '../src/repositories/cursadaRepository.js';
import materiaRepository from '../src/repositories/materiaRepository.js';
import calificacionRepository from '../src/repositories/calificacionRepository.js';
import asistenciaRepository from '../src/repositories/asistenciaRepository.js';
import { prisma } from '../src/config/prisma.js';
import { ROLES } from '../src/constants/roles.js';

const restorations: Array<() => void> = [];

function replaceMethod<T extends object, K extends keyof T>(target: T, key: K, replacement: T[K]) {
  const original = target[key];
  target[key] = replacement;
  restorations.push(() => {
    target[key] = original;
  });
}

afterEach(() => {
  while (restorations.length > 0) restorations.pop()?.();
});

test('el resumen por materia no consulta cada alumno por separado', async () => {
  replaceMethod(cursadaRepository, 'getCursadaActivaByMateria', async () => ({
    id: 11,
    materiaId: 3,
    anioLectivo: new Date().getFullYear(),
    periodo: 'ANUAL',
    activo: true
  }) as any);
  replaceMethod(materiaRepository, 'findById', async () => ({
    id: 3,
    nombre: 'Materia',
    notaMinima: 6,
    notaPromocion: 8,
    asistenciaRequerida: 75,
    tpRequeridos: 75,
    esPromocionable: false
  }) as any);
  replaceMethod(calificacionRepository, 'getInscriptosActivosByCursada', async () => ([
    { alumnoId: 21, alumno: { idCuenta: 101 } },
    { alumnoId: 22, alumno: { idCuenta: 102 } }
  ]) as any);
  replaceMethod(calificacionRepository, 'findAllByCursadaSimple', async () => [] as any);
  replaceMethod(asistenciaRepository, 'findAllByCursadaSimple', async () => [] as any);

  let consultasIndividuales = 0;
  replaceMethod(prisma.alumno, 'findUnique', (async () => {
    consultasIndividuales += 1;
    return null;
  }) as any);

  const resultado = await estadoAcademicoService.getResumenPorMateria(
    3,
    { id: 1, rol: ROLES.ADMINISTRATIVO }
  );

  assert.equal(consultasIndividuales, 0);
  assert.deepEqual(resultado.alumnos.map(a => a.alumnoUsuarioId), [101, 102]);
});
