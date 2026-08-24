import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import examenService from '../src/services/examenService.js';
import examenRepository from '../src/repositories/examenRepository.js';
import materiaRepository from '../src/repositories/materiaRepository.js';
import userRepository from '../src/repositories/userRepository.js';
import alumnoRepository from '../src/repositories/alumnoRepository.js';
import inscripcionMateriaRepository from '../src/repositories/inscripcionMateriaRepository.js';
import estadoAcademicoService from '../src/services/estadoAcademicoService.js';
import { ROLES } from '../src/constants/roles.js';

const restorations: Array<() => void> = [];

function replaceMethod<T extends object, K extends keyof T>(
  target: T,
  key: K,
  replacement: T[K]
) {
  const original = target[key];
  target[key] = replacement;
  restorations.push(() => {
    target[key] = original;
  });
}

afterEach(() => {
  while (restorations.length > 0) restorations.pop()?.();
});

test('permite inscribirse a una mesa con regularidad vigente de una cursada anterior', async () => {
  replaceMethod(userRepository, 'findById', async () => ({ rol: ROLES.ALUMNO }) as any);
  replaceMethod(alumnoRepository, 'findByUsuarioId', async () => ({ idAlumno: 42 }) as any);
  replaceMethod(examenRepository, 'findExamenById', async () => ({ materiaId: 7 }) as any);
  replaceMethod(inscripcionMateriaRepository, 'findByAlumnoAndMateria', async () => null);
  replaceMethod(materiaRepository, 'getCorrelatividades', async () => [] as any);
  replaceMethod(examenRepository, 'findInscripcionByMesaAndAlumno', async () => null);
  replaceMethod(
    examenRepository,
    'inscribirAlumno',
    async () => ({ mesaId: 3, alumnoId: 42, condicion: 'REGULAR' }) as any
  );

  const estadoService = estadoAcademicoService as typeof estadoAcademicoService & {
    tieneRegularidadVigente: (alumnoId: number, materiaId: number) => Promise<boolean>;
  };
  const original = estadoService.tieneRegularidadVigente;
  estadoService.tieneRegularidadVigente = async (alumnoId, materiaId) => {
    assert.equal(alumnoId, 42);
    assert.equal(materiaId, 7);
    return true;
  };
  restorations.push(() => {
    estadoService.tieneRegularidadVigente = original;
  });

  const result = await examenService.inscribirAlumno(
    3,
    10,
    'REGULAR',
    { id: 1, rol: ROLES.ADMINISTRATIVO }
  );

  assert.deepEqual(result, { mesaId: 3, alumnoId: 42, condicion: 'REGULAR' });
});

test('rechaza la inscripción regular cuando la regularidad está vencida', async () => {
  replaceMethod(userRepository, 'findById', async () => ({ rol: ROLES.ALUMNO }) as any);
  replaceMethod(alumnoRepository, 'findByUsuarioId', async () => ({ idAlumno: 42 }) as any);
  replaceMethod(examenRepository, 'findExamenById', async () => ({ materiaId: 7 }) as any);
  replaceMethod(inscripcionMateriaRepository, 'findByAlumnoAndMateria', async () => null);

  const estadoService = estadoAcademicoService as typeof estadoAcademicoService & {
    tieneRegularidadVigente: (alumnoId: number, materiaId: number) => Promise<boolean>;
  };
  const original = estadoService.tieneRegularidadVigente;
  estadoService.tieneRegularidadVigente = async () => false;
  restorations.push(() => {
    estadoService.tieneRegularidadVigente = original;
  });

  await assert.rejects(
    examenService.inscribirAlumno(
      3,
      10,
      'REGULAR',
      { id: 1, rol: ROLES.ADMINISTRATIVO }
    ),
    /regularidad vigente/
  );
});
