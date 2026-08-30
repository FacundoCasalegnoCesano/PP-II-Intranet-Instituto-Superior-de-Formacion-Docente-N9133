import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import horarioService from '../src/services/horarioService.js';
import horarioRepository from '../src/repositories/horarioRepository.js';
import cursadaRepository from '../src/repositories/cursadaRepository.js';
import periodoInscripcionRepository from '../src/repositories/periodoInscripcionRepository.js';
import { listarPeriodosSchema } from '../src/validations/periodoInscripcionValidation.js';
import { prisma } from '../src/config/prisma.js';
import { ROLES } from '../src/constants/roles.js';

const restorations: Array<() => void> = [];

function replaceMethod(target: any, key: string, replacement: any) {
  const original = target[key];
  target[key] = replacement;
  restorations.push(() => {
    if (original === undefined) delete target[key];
    else target[key] = original;
  });
}

const admin = { id: 1, rol: ROLES.ADMINISTRATIVO };

afterEach(() => {
  while (restorations.length > 0) restorations.pop()?.();
});

test('horarios consecutivos no se solapan aunque usen fechas ISO distintas', async () => {
  replaceMethod(cursadaRepository, 'findById', async () => ({ id: 4 }));
  replaceMethod(horarioRepository, 'verificarConflictos', async () => true);
  replaceMethod(horarioRepository, 'findActiveByCursadaAndDay', async () => [{
    id: 3,
    horaInicio: new Date('2026-03-01T10:00:00.000Z'),
    horaFin: new Date('2026-03-01T12:00:00.000Z')
  }]);
  let persisted = false;
  replaceMethod(horarioRepository, 'create', async (data: any) => {
    persisted = true;
    return data;
  });

  await horarioService.crearHorario({
    cursadaId: 4,
    dia: 'LUNES',
    horaInicio: '1970-01-01T12:00:00.000Z',
    horaFin: '1970-01-01T13:30:00.000Z'
  }, admin);

  assert.equal(persisted, true);
});

test('detecta solapamiento real comparando por minuto del día', async () => {
  replaceMethod(cursadaRepository, 'findById', async () => ({ id: 4 }));
  replaceMethod(horarioRepository, 'verificarConflictos', async () => false);
  replaceMethod(horarioRepository, 'findActiveByCursadaAndDay', async () => [{
    id: 3,
    horaInicio: new Date('2026-03-01T10:00:00.000Z'),
    horaFin: new Date('2026-03-01T12:00:00.000Z')
  }]);
  let persisted = false;
  replaceMethod(horarioRepository, 'create', async () => {
    persisted = true;
    return {};
  });

  await assert.rejects(horarioService.crearHorario({
    cursadaId: 4,
    dia: 'LUNES',
    horaInicio: '1970-01-01T11:30:00.000Z',
    horaFin: '1970-01-01T13:00:00.000Z'
  }, admin), /horario/i);
  assert.equal(persisted, false);
});

test('editar un horario excluye el propio registro del chequeo', async () => {
  replaceMethod(horarioRepository, 'findById', async () => ({
    id: 7,
    cursadaId: 4,
    dia: 'MARTES',
    horaInicio: new Date('2026-03-01T08:00:00.000Z'),
    horaFin: new Date('2026-03-01T10:00:00.000Z')
  }));
  replaceMethod(horarioRepository, 'verificarConflictos', async () => true);
  let excludedId: number | undefined;
  replaceMethod(horarioRepository, 'findActiveByCursadaAndDay', async (_cursada: number, _dia: string, exclude?: number) => {
    excludedId = exclude;
    return [];
  });
  let persisted = false;
  replaceMethod(horarioRepository, 'update', async (_id: number, data: any) => {
    persisted = true;
    return data;
  });

  await horarioService.updateHorario(7, {
    horaInicio: '1970-01-01T08:30:00.000Z',
    horaFin: '1970-01-01T10:30:00.000Z'
  }, admin);

  assert.equal(excludedId, 7);
  assert.equal(persisted, true);
});

test('el listado de períodos acepta y aplica cicloLectivo', async () => {
  assert.equal(listarPeriodosSchema.validate({ cicloLectivo: 2026 }).error, undefined);
  let receivedWhere: any;
  replaceMethod(prisma.periodoInscripcion, 'findMany', async ({ where }: any) => {
    receivedWhere = where;
    return [];
  });
  replaceMethod(prisma.periodoInscripcion, 'count', async () => 0);

  await periodoInscripcionRepository.findAll({ cicloLectivo: 2026 } as any);

  assert.equal(receivedWhere.cicloLectivo, 2026);
});

test('el detalle de un período incluye sus materias y mesas informativas', async () => {
  let include: any;
  replaceMethod(prisma.periodoInscripcion, 'findUnique', async (args: any) => {
    include = args.include;
    return null;
  });

  await periodoInscripcionRepository.findById(5);

  assert.equal(include.materias.include.materia, true);
  assert.equal(include.mesas.include.mesa, true);
});
