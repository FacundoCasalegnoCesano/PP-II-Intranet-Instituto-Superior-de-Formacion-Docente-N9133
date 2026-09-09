import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { prisma } from '../src/config/prisma.js';
import alumnoRepository from '../src/repositories/alumnoRepository.js';
import estadoAcademicoService from '../src/services/estadoAcademicoService.js';
import type { Estado } from '../src/domain/academico/trayectoriaAcademica.js';
import examenService from '../src/services/examenService.js';
import inscripcionMateriaService from '../src/services/inscripcionMateriaService.js';
import materiaRepository, { type CorrelatividadConMateria } from '../src/repositories/materiaRepository.js';
import materiaService from '../src/services/materiaService.js';
import periodoInscripcionRepository from '../src/repositories/periodoInscripcionRepository.js';

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

function configureEstadoAcademico(options: {
  regularizadas?: number[];
  aprobadas?: number[];
}) {
  const regularizadas = new Set(options.regularizadas ?? []);
  const aprobadas = new Set(options.aprobadas ?? []);
  const estados = new Map<number, Estado>();
  for (const materiaId of regularizadas) estados.set(materiaId, 'REGULAR');

  replaceMethod(estadoAcademicoService, 'getMapaEstadosPorMateria', async () => estados);
  replaceMethod(estadoAcademicoService, 'getMateriasAprobadasSet', async () => aprobadas);
  replaceMethod(estadoAcademicoService, 'esRegularizado', (estado) => {
    return estado !== undefined && regularizadas.has(Number(estado));
  });
}

function correlatividadFixture(overrides: Partial<CorrelatividadConMateria> = {}): CorrelatividadConMateria {
  return {
    id: 1,
    materiaOrigenId: 20,
    materiaRequeridaId: 11,
    materiaRequerida: {
      id: 11,
      nombre: 'Didáctica',
      carrera: { id: 1, nombre: 'Profesorado' }
    },
    tipoRequisito: 'OBLIGATORIA',
    aplicaCursado: true,
    aplicaRendir: true,
    ...overrides
  };
}

afterEach(() => {
  while (restorations.length > 0) restorations.pop()?.();
});

test('CURSAR exige la correlativa obligatoria y conserva el texto de error', async () => {
  replaceMethod(materiaRepository, 'getCorrelatividades', async () => [
    correlatividadFixture()
  ]);
  configureEstadoAcademico({});

  await assert.rejects(
    inscripcionMateriaService.verificarCorrelatividades(7, 20),
    new Error('Correlatividad no cumplida: necesitás tener REGULARIZADO Didáctica')
  );
});

test('CURSAR ignora correlativas que solo aplican al rendir', async () => {
  replaceMethod(materiaRepository, 'getCorrelatividades', async () => [
    correlatividadFixture({
      aplicaCursado: false,
      aplicaRendir: true
    })
  ]);
  configureEstadoAcademico({});

  await inscripcionMateriaService.verificarCorrelatividades(7, 20);
});

test('RENDIR filtra las correlatividades obligatorias por aplicaRendir', async () => {
  replaceMethod(materiaRepository, 'getCorrelatividades', async () => [
    correlatividadFixture({ aplicaRendir: false })
  ]);
  replaceMethod(estadoAcademicoService, 'getMateriasAprobadasSet', async () => new Set());

  await examenService.verificarCorrelatividadesParaExamen(7, 20);
});

test('RENDIR bloquea la primera OBLIGATORIA pendiente con su mensaje actual', async () => {
  replaceMethod(materiaRepository, 'getCorrelatividades', async () => [
    correlatividadFixture({ aplicaRendir: true }),
    correlatividadFixture({
      id: 2,
      materiaRequeridaId: 12,
      materiaRequerida: {
        id: 12,
        nombre: 'Pedagogía',
        carrera: { id: 1, nombre: 'Profesorado' }
      },
      aplicaRendir: true
    })
  ]);
  replaceMethod(estadoAcademicoService, 'getMateriasAprobadasSet', async () => new Set());

  await assert.rejects(
    examenService.verificarCorrelatividadesParaExamen(7, 20),
    new Error('Falta correlatividad obligatoria para rendir: Didáctica')
  );
});

test('MOSTRAR_DISPONIBILIDAD conserva el orden y los duplicados de obligatorias', async () => {
  replaceMethod(
    alumnoRepository,
    'findByUsuarioId',
    async () => ({ idAlumno: 7 } as unknown as Awaited<ReturnType<typeof alumnoRepository.findByUsuarioId>>)
  );
  replaceMethod(prisma.inscripcionCarrera as unknown as Record<string, unknown>, 'findMany', async () => [
    { carreraId: 1, carrera: { id: 1, nombre: 'Profesorado' } }
  ] as unknown as Awaited<ReturnType<typeof prisma.inscripcionCarrera.findMany>>);
  replaceMethod(materiaRepository, 'getMateriasDisponibles', async () => ({ materias: [
    {
      id: 20,
      nombre: 'Residencia',
      cursadas: [],
      correlatividadesOrigen: [
        {
          tipoRequisito: 'OBLIGATORIA',
          materiaRequeridaId: 11,
          materiaRequerida: { id: 11, nombre: 'Didáctica' },
          aplicaCursado: true,
          aplicaRendir: true
        },
        {
          tipoRequisito: 'OBLIGATORIA',
          materiaRequeridaId: 11,
          materiaRequerida: { id: 11, nombre: 'Didáctica' },
          aplicaCursado: true,
          aplicaRendir: true
        },
        {
          tipoRequisito: 'OBLIGATORIA',
          materiaRequeridaId: 13,
          materiaRequerida: { id: 13, nombre: 'Psicología' },
          aplicaCursado: true,
          aplicaRendir: true
        }
      ]
    }
  ], materiasInscriptasIds: [], materiasAprobadasIds: [] } as unknown as Awaited<ReturnType<typeof materiaRepository.getMateriasDisponibles>>));
  replaceMethod(periodoInscripcionRepository, 'materiasHabilitadasEnPeriodoVigente', async () => new Set([20]));

  const result = await materiaService.getMateriasDisponibles(10, 2026);

  assert.equal(result[0].cumpleCorrelativas, false);
  assert.deepEqual(result[0].correlativasPendientes, [
    { id: 11, nombre: 'Didáctica' },
    { id: 11, nombre: 'Didáctica' },
    { id: 13, nombre: 'Psicología' }
  ]);
});
