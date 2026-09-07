import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { prisma } from '../src/config/prisma.js';
import materiaRepository from '../src/repositories/materiaRepository.js';
import { correlatividadSchema } from '../src/validations/materiaValidation.js';

const restorations: Array<() => void> = [];

function replaceMethod(target: Record<string, unknown>, key: string, replacement: unknown) {
  const original = target[key];
  target[key] = replacement;
  restorations.push(() => {
    target[key] = original;
  });
}

afterEach(() => {
  while (restorations.length > 0) restorations.pop()?.();
});

test('acepta una correlatividad obligatoria sin parámetros de grupo', async () => {
  const resultado = await correlatividadSchema.validateAsync({
    materiaRequeridaId: 12,
    tipoRequisito: 'OBLIGATORIA'
  });

  assert.deepEqual(resultado, {
    materiaRequeridaId: 12,
    tipoRequisito: 'OBLIGATORIA',
    aplicaCursado: true,
    aplicaRendir: true
  });
});

for (const tipoRequisito of ['ALTERNATIVA', 'GRUPO']) {
  test(`rechaza el tipo de correlatividad ${tipoRequisito}`, async () => {
    await assert.rejects(
      correlatividadSchema.validateAsync({ materiaRequeridaId: 12, tipoRequisito }),
      (error: any) => error.details?.[0]?.type === 'any.only'
    );
  });
}

for (const campo of ['grupo', 'cantidadMinimaAprobadas']) {
  test(`rechaza el parámetro ${campo} en una correlatividad obligatoria`, async () => {
    await assert.rejects(
      correlatividadSchema.validateAsync({
        materiaRequeridaId: 12,
        tipoRequisito: 'OBLIGATORIA',
        [campo]: campo === 'grupo' ? 'BASE' : 2
      }),
      (error: any) => error.details?.[0]?.type === 'object.unknown'
    );
  });
}

test('el repositorio entrega al flujo activo únicamente correlatividades obligatorias', async () => {
  let consulta: any;
  replaceMethod(prisma.correlatividad as any, 'findMany', async (args: any) => {
    consulta = args;
    return [];
  });

  await materiaRepository.getCorrelatividades(20);

  assert.deepEqual(consulta.where, {
    materiaOrigenId: 20,
    tipoRequisito: 'OBLIGATORIA'
  });
});
