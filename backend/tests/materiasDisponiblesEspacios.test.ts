import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { prisma } from '../src/config/prisma.js';
import alumnoRepository from '../src/repositories/alumnoRepository.js';
import materiaRepository from '../src/repositories/materiaRepository.js';
import periodoInscripcionRepository from '../src/repositories/periodoInscripcionRepository.js';
import estadoAcademicoService from '../src/services/estadoAcademicoService.js';
import materiaService from '../src/services/materiaService.js';

const restorations: Array<() => void> = [];

function replaceMethod<T extends object, K extends keyof T>(target: T, key: K, replacement: T[K]) {
  const original = target[key];
  target[key] = replacement;
  restorations.push(() => { target[key] = original; });
}

afterEach(() => {
  while (restorations.length > 0) restorations.pop()?.();
});

test('materias disponibles omite componentes de espacios activos, incluso sin oferta del ciclo', async () => {
  replaceMethod(alumnoRepository, 'findByUsuarioId', async () => ({ idAlumno: 7 } as any));
  replaceMethod(prisma.inscripcionCarrera as any, 'findMany', async () => [
    { carreraId: 1, carrera: { id: 1, nombre: 'Profesorado' } }
  ]);
  replaceMethod(materiaRepository, 'getMateriasDisponibles', async () => ({
    materias: [
      { id: 1, nombre: 'Materia independiente', carrera: { id: 1, nombre: 'Profesorado' }, cursadas: [], correlatividadesOrigen: [] },
      { id: 2, nombre: 'Componente activo', carrera: { id: 1, nombre: 'Profesorado' }, espacioCurricularId: 10, cursadas: [], correlatividadesOrigen: [] },
      { id: 3, nombre: 'Componente activo ya inscripto', carrera: { id: 1, nombre: 'Profesorado' }, espacioCurricularId: 10, cursadas: [], correlatividadesOrigen: [] },
      { id: 4, nombre: 'Componente de espacio inactivo', carrera: { id: 1, nombre: 'Profesorado' }, espacioCurricularId: 20, cursadas: [], correlatividadesOrigen: [] }
    ],
    materiasInscriptasIds: [3],
    materiasAprobadasIds: []
  }) as any);
  replaceMethod(prisma.espacioCurricular as any, 'findMany', async () => [
    { id: 10, activo: true, materias: [{ id: 2 }, { id: 3 }] }
  ]);
  replaceMethod(prisma.espacioCorrelatividad as any, 'findMany', async () => []);
  replaceMethod(estadoAcademicoService, 'getMapaEstadosPorMateria', async () => new Map());
  replaceMethod(estadoAcademicoService, 'getMateriasAprobadasSet', async () => new Set());
  replaceMethod(periodoInscripcionRepository, 'materiasHabilitadasEnPeriodoVigente', async () => new Set());

  const result = await materiaService.getMateriasDisponibles(12, 2025);

  assert.deepEqual(result.map(({ id }) => id), [1, 4]);
});
