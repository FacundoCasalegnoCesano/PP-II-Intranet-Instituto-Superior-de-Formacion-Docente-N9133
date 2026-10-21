import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { prisma } from '../src/config/prisma.js';
import alumnoRepository from '../src/repositories/alumnoRepository.js';
import userRepository from '../src/repositories/userRepository.js';
import estadoAcademicoService from '../src/services/estadoAcademicoService.js';
import inscripcionMateriaService from '../src/services/inscripcionMateriaService.js';
import { ROLES } from '../src/constants/roles.js';
import { anioInstitucionalActual } from '../src/utils/cicloLectivo.js';

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

test('para cursar exige que cada materia del espacio correlativo esté cursada o aprobada', async () => {
  replaceMethod(prisma.materia as any, 'findUnique', async () => ({ espacioCurricular: { id: 20, nombre: 'Espacio origen', activo: true, materias: [{ id: 7 }, { id: 8 }] } }));
  replaceMethod(prisma.espacioCorrelatividad as any, 'findMany', async () => [{
    id: 3,
    materiaRequerida: null,
    espacioRequerido: { id: 30, nombre: 'Espacio requerido', materias: [{ id: 31 }, { id: 32 }] }
  }]);
  replaceMethod(estadoAcademicoService, 'getMapaEstadosPorMateria', async () => new Map([[31, 'REGULAR']] as any));
  replaceMethod(estadoAcademicoService, 'getMateriasAprobadasSet', async () => new Set([31]));
  await assert.rejects(inscripcionMateriaService.verificarCorrelatividades(42, 7), /Espacio requerido/);
});

test('alumno no puede autoinscribirse a una materia de un ciclo anterior', async () => {
  replaceMethod(userRepository as any, 'findById', async () => ({ idUsuario: 42, rol: ROLES.ALUMNO, activo: true }));
  replaceMethod(alumnoRepository as any, 'findByUsuarioId', async () => ({ idAlumno: 14, idCuenta: 42 }));
  replaceMethod(prisma.materia as any, 'findUnique', async () => assert.fail('Debe bloquear antes de cargar la materia'));

  await assert.rejects(
    inscripcionMateriaService.inscribirAlumno({ alumnoId: 42, materiaId: 7, cicloLectivo: anioInstitucionalActual() - 1 } as any, { id: 42, rol: ROLES.ALUMNO }),
    (error: any) => error.statusCode === 409 && /antecedente histórico/.test(error.message)
  );
});
