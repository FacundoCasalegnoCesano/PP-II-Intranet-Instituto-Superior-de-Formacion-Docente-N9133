import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import alumnoRepository from '../src/repositories/alumnoRepository.js';
import examenRepository from '../src/repositories/examenRepository.js';
import { prisma } from '../src/config/prisma.js';
import estadoAcademicoService from '../src/services/estadoAcademicoService.js';
import examenService from '../src/services/examenService.js';
import examenController from '../src/controllers/examenController.js';
import { ROLES } from '../src/constants/roles.js';

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

function mesaCandidata(input: {
  id: number;
  materiaId: number;
  conInscripcionMateria?: boolean;
  inscripto?: boolean;
  correlativaId?: number;
}) {
  return {
    id: input.id,
    materiaId: input.materiaId,
    fecha: new Date(`2026-09-${String(input.id).padStart(2, '0')}T12:00:00.000Z`),
    tipoExamen: 'ESCRITO',
    llamado: 1,
    materia: {
      id: input.materiaId,
      nombre: `Materia ${input.materiaId}`,
      carrera: { id: 2, nombre: 'Profesorado' },
      correlatividadesOrigen: input.correlativaId === undefined
        ? []
        : [{
            materiaRequeridaId: input.correlativaId,
            materiaRequerida: {
              id: input.correlativaId,
              nombre: `Correlativa ${input.correlativaId}`
            },
            aplicaCursado: true,
            aplicaRendir: true
          }],
      inscripciones: input.conInscripcionMateria ? [{ id: input.id * 10 }] : []
    },
    tribunales: [],
    inscripciones: input.inscripto
      ? [{ id: input.id * 100, fechaBaja: null }]
      : []
  };
}

test('lista una mesa regular con fecha y hora, tribunal e inscripción actual', async () => {
  const fecha = new Date('2026-09-15T12:00:00.000Z');
  replaceMethod(alumnoRepository, 'findByUsuarioId', async () => ({ idAlumno: 42 }));
  replaceMethod(examenRepository, 'findMesasDisponiblesParaAlumno', async () => ([{
    id: 12,
    materiaId: 7,
    fecha,
    tipoExamen: 'ORAL',
    llamado: 1,
    materia: {
      id: 7,
      nombre: 'Didáctica',
      carrera: { id: 2, nombre: 'Profesorado' },
      correlatividadesOrigen: [],
      inscripciones: []
    },
    tribunales: [{
      profesorId: 8,
      rolTribunal: 'PRESIDENTE',
      profesor: { apellidoNombre: 'Profesor Ejemplo' }
    }],
    inscripciones: []
  }]));
  replaceMethod(
    estadoAcademicoService,
    'getRegularidadesVigentesSet',
    async () => new Set([7])
  );
  replaceMethod(
    estadoAcademicoService,
    'getMateriasAprobadasSet',
    async () => new Set<number>()
  );

  const service = examenService as typeof examenService & {
    getMesasDisponibles: (
      currentUser: { id: number; rol: string },
      evaluadoEn: Date
    ) => Promise<unknown[]>;
  };
  const resultado = await service.getMesasDisponibles(
    { id: 10, rol: ROLES.ALUMNO },
    new Date('2026-08-26T15:00:00.000Z')
  );

  assert.deepEqual(resultado, [{
    id: 12,
    materia: {
      id: 7,
      nombre: 'Didáctica',
      carrera: { id: 2, nombre: 'Profesorado' }
    },
    fecha,
    tipoExamen: 'ORAL',
    llamado: 1,
    tribunal: [{
      profesorId: 8,
      apellidoNombre: 'Profesor Ejemplo',
      rolTribunal: 'PRESIDENTE'
    }],
    condicion: 'REGULAR',
    inscripto: false
  }]);
});

test('no calcula hechos académicos cuando no hay mesas candidatas', async () => {
  replaceMethod(alumnoRepository, 'findByUsuarioId', async () => ({ idAlumno: 42 }));
  replaceMethod(examenRepository, 'findMesasDisponiblesParaAlumno', async () => []);
  replaceMethod(
    estadoAcademicoService,
    'getRegularidadesVigentesSet',
    async () => {
      throw new Error('No debe calcular regularidades');
    }
  );
  replaceMethod(
    estadoAcademicoService,
    'getMateriasAprobadasSet',
    async () => {
      throw new Error('No debe calcular materias aprobadas');
    }
  );

  const resultado = await examenService.getMesasDisponibles(
    { id: 10, rol: ROLES.ALUMNO },
    new Date('2026-08-26T15:00:00.000Z')
  );

  assert.deepEqual(resultado, []);
});

test('prioriza REGULAR, permite LIBRE y excluye condiciones o correlatividades incumplidas', async () => {
  const consultas: Array<{ alumnoId: number; materiaIds: number[] }> = [];
  replaceMethod(alumnoRepository, 'findByUsuarioId', async () => ({ idAlumno: 42 }));
  replaceMethod(examenRepository, 'findMesasDisponiblesParaAlumno', async () => [
    mesaCandidata({ id: 11, materiaId: 7, conInscripcionMateria: true, inscripto: true }),
    mesaCandidata({ id: 12, materiaId: 8, conInscripcionMateria: true }),
    mesaCandidata({ id: 13, materiaId: 9 }),
    mesaCandidata({ id: 14, materiaId: 10, conInscripcionMateria: true, correlativaId: 99 })
  ]);
  replaceMethod(
    estadoAcademicoService,
    'getRegularidadesVigentesSet',
    async (alumnoId: number, materiaIds: number[]) => {
      consultas.push({ alumnoId, materiaIds });
      return new Set([7]);
    }
  );
  replaceMethod(
    estadoAcademicoService,
    'getMateriasAprobadasSet',
    async () => new Set<number>()
  );

  const resultado = await examenService.getMesasDisponibles(
    { id: 10, rol: ROLES.ALUMNO },
    new Date('2026-08-26T15:00:00.000Z')
  );

  assert.deepEqual(consultas, [{ alumnoId: 42, materiaIds: [7, 8, 9, 10] }]);
  assert.deepEqual(
    resultado.map(mesa => ({ id: mesa.id, condicion: mesa.condicion, inscripto: mesa.inscripto })),
    [
      { id: 11, condicion: 'REGULAR', inscripto: true },
      { id: 12, condicion: 'LIBRE', inscripto: false }
    ]
  );
});

test('la consulta candidata exige período vigente, carrera activa y mesa futura abierta', async () => {
  let consulta: any;
  replaceMethod(prisma.mesa as unknown as Record<string, unknown>, 'findMany', async (args: any) => {
    consulta = args;
    return [];
  });
  const evaluadoEn = new Date('2026-08-26T15:00:00.000Z');
  const fechaDesde = new Date('2026-08-27T03:00:00.000Z');

  await examenRepository.findMesasDisponiblesParaAlumno({
    usuarioId: 10,
    alumnoId: 42,
    cicloLectivo: 2026,
    evaluadoEn,
    fechaDesde
  });

  assert.deepEqual(consulta.where, {
    activo: true,
    estadoMesa: 'ABIERTA',
    fecha: { gte: fechaDesde },
    periodosHabilitadores: {
      some: {
        periodoInscripcion: {
          tipo: 'EXAMEN',
          activo: true,
          fechaInicio: { lte: evaluadoEn },
          fechaFin: { gte: evaluadoEn }
        }
      }
    },
    materia: {
      carrera: {
        inscripciones: {
          some: { usuarioId: 10, activo: true, fechaBaja: null }
        }
      }
    }
  });
  assert.deepEqual(consulta.orderBy, [{ fecha: 'asc' }, { id: 'asc' }]);
});

test('el controlador obtiene el alumno del token y responde success con las mesas', async () => {
  const usuario = { id: 10, rol: ROLES.ALUMNO };
  const mesas = [{ id: 12, condicion: 'REGULAR', inscripto: false }];
  replaceMethod(examenService, 'getMesasDisponibles', async (currentUser: unknown) => {
    assert.equal(currentUser, usuario);
    return mesas;
  });
  let respuesta: unknown;
  const req = { user: usuario };
  const res = {
    json(payload: unknown) {
      respuesta = payload;
    }
  };
  const next = (error: unknown) => {
    throw error;
  };
  const controller = examenController as typeof examenController & {
    getMesasDisponibles: (
      req: typeof req,
      res: typeof res,
      next: typeof next
    ) => Promise<void>;
  };

  await controller.getMesasDisponibles(req, res, next);

  assert.deepEqual(respuesta, { success: true, data: mesas });
});
