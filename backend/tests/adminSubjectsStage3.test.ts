import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import materiaService from '../src/services/materiaService.js';
import materiaRepository from '../src/repositories/materiaRepository.js';
import carreraRepository from '../src/repositories/carreraRepository.js';
import { createMateriaSchema } from '../src/validations/materiaValidation.js';

const restorations: Array<() => void> = [];

function replaceMethod(target: any, key: string, replacement: any) {
  const original = target[key];
  target[key] = replacement;
  restorations.push(() => {
    if (original === undefined) delete target[key];
    else target[key] = original;
  });
}

function materiaInput(overrides: Record<string, unknown> = {}) {
  return {
    nombre: 'Lengua',
    descripcion: 'Contenidos',
    cargaHoraria: 96,
    tipoEspacio: 'MATERIA',
    carreraId: 2,
    cursoAnio: 1,
    ...overrides
  } as any;
}

afterEach(() => {
  while (restorations.length > 0) restorations.pop()?.();
});

test('permite materias homónimas en carreras distintas y guarda el nombre normalizado', async () => {
  replaceMethod(carreraRepository, 'findById', async () => ({ id: 2, nombre: 'Profesorado B', duracionAnios: 4 }));
  replaceMethod(materiaRepository, 'findByNombre', async () => ({ id: 1, carreraId: 1, nombre: 'Lengua' }));
  replaceMethod(materiaRepository, 'findByCareerAndName', async () => null);
  replaceMethod(materiaRepository, 'resolveCursoId', async () => 12);
  let persisted: any;
  replaceMethod(materiaRepository, 'create', async (data: any) => {
    persisted = data;
    return { id: 9, ...data };
  });

  await materiaService.createMateria(materiaInput({ nombre: '  Lengua   y   Literatura  ' }));

  assert.equal(persisted.nombre, 'Lengua y Literatura');
  assert.equal(persisted.carreraId, 2);
  assert.equal(persisted.cursoId, 12);
  assert.equal('cursoAnio' in persisted, false);
});

test('rechaza el mismo nombre normalizado dentro de una carrera', async () => {
  replaceMethod(carreraRepository, 'findById', async () => ({ id: 2, nombre: 'Profesorado B', duracionAnios: 4 }));
  replaceMethod(materiaRepository, 'findByNombre', async () => null);
  replaceMethod(materiaRepository, 'findByCareerAndName', async () => ({ id: 8, carreraId: 2, nombre: 'Lengua' }));
  let persisted = false;
  replaceMethod(materiaRepository, 'create', async () => {
    persisted = true;
    return {};
  });

  await assert.rejects(
    materiaService.createMateria(materiaInput({ nombre: ' Lengua  ' })),
    (error: any) => error.statusCode === 409
  );
  assert.equal(persisted, false);
});

test('cursoAnio es preferido, debe estar dentro de la duración y conserva cursoId heredado', async () => {
  const valid = createMateriaSchema.validate(materiaInput()).error;
  assert.equal(valid, undefined);
  assert.ok(createMateriaSchema.validate(materiaInput({ cursoAnio: undefined, cursoId: undefined })).error);

  replaceMethod(carreraRepository, 'findById', async () => ({ id: 2, nombre: 'Profesorado B', duracionAnios: 4 }));
  replaceMethod(materiaRepository, 'findByNombre', async () => null);
  replaceMethod(materiaRepository, 'findByCareerAndName', async () => null);
  replaceMethod(materiaRepository, 'resolveCursoId', async () => 12);
  replaceMethod(materiaRepository, 'create', async (data: any) => data);

  await assert.rejects(
    materiaService.createMateria(materiaInput({ cursoAnio: 5 })),
    (error: any) => error.statusCode === 400 && /duraci/i.test(error.message)
  );
});

test('rechaza correlativas de otra carrera y correlativas duplicadas', async () => {
  let required = { id: 2, carreraId: 9, nombre: 'Historia' };
  replaceMethod(materiaRepository, 'findById', async (id: number) => id === 1
    ? { id: 1, carreraId: 2, nombre: 'Lengua' }
    : required);
  replaceMethod(materiaRepository, 'findCorrelativity', async () => null);
  replaceMethod(materiaRepository, 'getCorrelativityEdges', async () => []);
  let persisted = false;
  replaceMethod(materiaRepository, 'addCorrelatividad', async () => {
    persisted = true;
    return {};
  });

  await assert.rejects(
    materiaService.addCorrelatividad({ materiaOrigenId: 1, materiaRequeridaId: 2, tipoRequisito: 'OBLIGATORIA' }),
    (error: any) => error.statusCode === 400 && /misma carrera/i.test(error.message)
  );
  assert.equal(persisted, false);

  required = { id: 2, carreraId: 2, nombre: 'Historia' };
  replaceMethod(materiaRepository, 'findCorrelativity', async () => ({ id: 6 }));
  await assert.rejects(
    materiaService.addCorrelatividad({ materiaOrigenId: 1, materiaRequeridaId: 2, tipoRequisito: 'OBLIGATORIA' }),
    (error: any) => error.statusCode === 409
  );
});

test('rechaza ciclos directos o transitivos entre correlatividades', async () => {
  replaceMethod(materiaRepository, 'findById', async (id: number) => ({ id, carreraId: 2, nombre: `Materia ${id}` }));
  replaceMethod(materiaRepository, 'findCorrelativity', async () => null);
  replaceMethod(materiaRepository, 'getCorrelativityEdges', async () => [
    { materiaOrigenId: 2, materiaRequeridaId: 3 },
    { materiaOrigenId: 3, materiaRequeridaId: 1 }
  ]);
  let persisted = false;
  replaceMethod(materiaRepository, 'addCorrelatividad', async () => {
    persisted = true;
    return {};
  });

  await assert.rejects(
    materiaService.addCorrelatividad({ materiaOrigenId: 1, materiaRequeridaId: 2, tipoRequisito: 'OBLIGATORIA' }),
    (error: any) => error.statusCode === 400 && /ciclo/i.test(error.message)
  );
  assert.equal(persisted, false);
});
