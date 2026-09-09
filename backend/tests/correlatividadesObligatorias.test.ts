import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import express from 'express';
import { createServer } from 'node:http';

import { prisma } from '../src/config/prisma.js';
import materiaRepository from '../src/repositories/materiaRepository.js';
import { validationMiddleware } from '../src/middleware/validation.js';
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

async function postCorrelatividad(body: Record<string, unknown>): Promise<Response> {
  const app = express();
  app.use(express.json());
  app.post(
    '/materias/1/correlatividades',
    validationMiddleware(correlatividadSchema, 'body', { stripUnknown: false }),
    (_req, res) => res.status(201).json({ success: true })
  );

  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No se pudo abrir el servidor de prueba');

  try {
    return await fetch(`http://127.0.0.1:${address.port}/materias/1/correlatividades`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

test('acepta una correlatividad individual solo con la materia requerida', async () => {
  const resultado = await correlatividadSchema.validateAsync({
    materiaRequeridaId: 12
  });

  assert.deepEqual(resultado, {
    materiaRequeridaId: 12
  });
});

for (const campo of ['tipoRequisito', 'aplicaCursado', 'aplicaRendir']) {
  test(`rechaza el campo controlado ${campo}`, async () => {
    await assert.rejects(
      correlatividadSchema.validateAsync({
        materiaRequeridaId: 12,
        [campo]: campo === 'tipoRequisito' ? 'OBLIGATORIA' : true
      }),
      (error: any) => error.details?.[0]?.type === 'object.unknown'
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

for (const campo of ['tipoRequisito', 'aplicaCursado', 'aplicaRendir']) {
  test(`HTTP rechaza ${campo} en la ruta individual`, async () => {
    const response = await postCorrelatividad({
      materiaRequeridaId: 12,
      [campo]: campo === 'tipoRequisito' ? 'OBLIGATORIA' : true
    });

    assert.equal(response.status, 400);
  });
}

test('HTTP acepta el body individual válido con sólo materiaRequeridaId', async () => {
  const response = await postCorrelatividad({ materiaRequeridaId: 12 });

  assert.equal(response.status, 201);
});
