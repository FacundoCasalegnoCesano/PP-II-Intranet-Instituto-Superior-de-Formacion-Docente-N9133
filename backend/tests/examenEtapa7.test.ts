import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import examenService from '../src/services/examenService.js';
import examenRepository from '../src/repositories/examenRepository.js';
import materiaRepository from '../src/repositories/materiaRepository.js';
import alumnoRepository from '../src/repositories/alumnoRepository.js';
import Joi from 'joi';
import { notaExamenSchema } from '../src/validations/examenValidation.js';
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

test('acepta nota cero como calificación y usa la mínima de la materia', async () => {
  let received: unknown[] = [];
  replaceMethod(examenRepository, 'findExamenById', async () => ({
    materiaId: 7,
    tribunales: [{ profesorId: 20, rolTribunal: 'VOCAL' }]
  }));
  replaceMethod(materiaRepository, 'findById', async () => ({ notaMinima: 7 }));
  replaceMethod(alumnoRepository, 'findByUsuarioId', async () => ({ idAlumno: 42 }));
  replaceMethod(examenRepository, 'registrarNota', async (...args: unknown[]) => {
    received = args;
    return { version: 3 };
  });

  await examenService.registrarNota(
    9,
    13,
    0,
    { id: 20, rol: ROLES.PROFESOR },
    false,
    2
  );

  assert.deepEqual(received, [9, 42, 0, { id: 20, rol: ROLES.PROFESOR }, 2, false, 7]);
});

test('permite ausente sin nota y no lo confunde con nota cero', async () => {
  let received: unknown[] = [];
  replaceMethod(examenRepository, 'findExamenById', async () => ({
    materiaId: 7,
    tribunales: [{ profesorId: 20, rolTribunal: 'PRESIDENTE' }]
  }));
  replaceMethod(materiaRepository, 'findById', async () => ({ notaMinima: 6 }));
  replaceMethod(alumnoRepository, 'findByUsuarioId', async () => ({ idAlumno: 42 }));
  replaceMethod(examenRepository, 'registrarNota', async (...args: unknown[]) => {
    received = args;
    return { version: 4 };
  });

  await examenService.registrarNota(9, 13, null, { id: 20, rol: ROLES.PROFESOR }, true, 3);

  assert.deepEqual(received, [9, 42, null, { id: 20, rol: ROLES.PROFESOR }, 3, true, 6]);
});

test('sólo el presidente puede cerrar y envía expectedVersion', async () => {
  replaceMethod(examenRepository, 'findExamenById', async () => ({
    tribunales: [{ profesorId: 20, rolTribunal: 'VOCAL' }]
  }));
  replaceMethod(examenRepository, 'cerrarMesa', async () => {
    throw new Error('no debe persistir');
  });

  await assert.rejects(
    examenService.cerrarMesa(9, { id: 20, rol: ROLES.PROFESOR }, 7),
    (error: any) => error.statusCode === 403 && /presidente/i.test(error.message)
  );
});

test('el presidente puede cerrar con versión esperada', async () => {
  let received: unknown[] = [];
  replaceMethod(examenRepository, 'findExamenById', async () => ({
    tribunales: [{ profesorId: 20, rolTribunal: 'PRESIDENTE' }]
  }));
  replaceMethod(examenRepository, 'cerrarMesa', async (...args: unknown[]) => {
    received = args;
    return { id: 9, version: 8 };
  });

  const result = await examenService.cerrarMesa(9, { id: 20, rol: ROLES.PROFESOR }, 7);

  assert.deepEqual(received, [9, { id: 20, rol: ROLES.PROFESOR }, 7]);
  assert.equal(result.version, 8);
});

test('la consulta del alumno devuelve EN_REVISION sin nota provisional', async () => {
  replaceMethod(alumnoRepository, 'findByUsuarioId', async () => ({ idAlumno: 42 }));
  replaceMethod(examenRepository, 'getInscripcionesByAlumno', async () => [{
    id: 5,
    mesaId: 9,
    condicion: 'REGULAR',
    notaFinal: 8,
    aprobado: true,
    notaBorrador: 4,
    ausenteBorrador: false,
    ausentePublicado: false,
    mesa: {
      estadoMesa: 'EN_PROCESO',
      publicadaEn: new Date('2026-09-10T12:00:00.000Z'),
      fecha: new Date('2026-09-01T12:00:00.000Z'),
      materia: { id: 7, nombre: 'Didáctica' }
    }
  }]);

  const result = await examenService.getInscripcionesByAlumno(
    13,
    { id: 13, rol: ROLES.ALUMNO }
  );

  assert.deepEqual(result, [{
    id: 5,
    mesaId: 9,
    materia: { id: 7, nombre: 'Didáctica' },
    fecha: new Date('2026-09-01T12:00:00.000Z'),
    condicion: 'REGULAR',
    estadoResultado: 'EN_REVISION',
    nota: null,
    aprobado: null,
    notaMinima: 6
  }]);
  assert.equal(JSON.stringify(result).includes('notaBorrador'), false);
});

test('la validación distingue nota cero, ausencia y carga incompleta', () => {
  assert.equal(notaExamenSchema.validate({ alumnoId: 13, nota: 0 }).error, undefined);
  assert.equal(notaExamenSchema.validate({ alumnoId: 13, ausente: true }).error, undefined);
  assert.ok(notaExamenSchema.validate({ alumnoId: 13 }).error);
  assert.ok(notaExamenSchema.validate({ alumnoId: 13, nota: 0, ausente: true }).error);
  assert.equal(Joi.isSchema(notaExamenSchema), true);
});
