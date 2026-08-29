import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import userService from '../src/services/userService.js';
import userRepository from '../src/repositories/userRepository.js';
import inscripcionCarreraService from '../src/services/inscripcionCarreraService.js';
import carreraService from '../src/services/carreraService.js';
import carreraRepository from '../src/repositories/carreraRepository.js';
import cursadaService from '../src/services/cursadaService.js';
import cursadaRepository from '../src/repositories/cursadaRepository.js';
import examenService from '../src/services/examenService.js';
import examenRepository from '../src/repositories/examenRepository.js';
import materiaRepository from '../src/repositories/materiaRepository.js';
import alumnoRepository from '../src/repositories/alumnoRepository.js';
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

afterEach(() => {
  while (restorations.length > 0) restorations.pop()?.();
});

test('un usuario no administrativo no puede cambiar rol ni estado desde su perfil', async () => {
  replaceMethod(userRepository, 'findById', async () => ({
    idUsuario: 8,
    email: 'alumno@example.com',
    dni: 30111222,
    rol: ROLES.ALUMNO,
    passwordHash: 'hash'
  }) as any);

  await assert.rejects(
    userService.updateUser(
      8,
      { rol: ROLES.ADMINISTRATIVO, activo: false } as any,
      { id: 8, email: 'alumno@example.com', dni: '30111222', rol: ROLES.ALUMNO, nombre: 'Alumno' }
    ),
    (error: any) => error.statusCode === 403
  );
});

test('un administrativo puede quitar un rol sin eliminar el último', async () => {
  replaceMethod(userRepository, 'findById', async () => ({
    idUsuario: 8,
    rol: `${ROLES.ALUMNO},${ROLES.PROFESOR}`,
    passwordHash: 'hash',
    backupCodes: null
  }) as any);
  replaceMethod(userRepository, 'update', async (_id, data) => ({
    idUsuario: 8,
    rol: data.rol,
    passwordHash: 'hash',
    backupCodes: null
  }) as any);
  replaceMethod(prisma.sesion, 'updateMany', async () => ({ count: 0 }) as any);

  const result = await userService.removeUserRole(
    8,
    ROLES.PROFESOR,
    { id: 1, email: 'admin@example.com', dni: '30000000', rol: ROLES.ADMINISTRATIVO, nombre: 'Admin' }
  );

  assert.deepEqual(result.roles, [ROLES.ALUMNO]);
});

test('un administrativo no puede quitarse a sí mismo el rol administrativo', async () => {
  replaceMethod(userRepository, 'findById', async () => ({
    idUsuario: 8,
    rol: `${ROLES.ADMINISTRATIVO},${ROLES.PROFESOR}`
  }) as any);

  await assert.rejects(
    userService.removeUserRole(
      8,
      ROLES.ADMINISTRATIVO,
      { id: 8, email: 'admin@example.com', dni: '30000000', rol: ROLES.ADMINISTRATIVO, nombre: 'Admin' }
    ),
    (error: any) => error.statusCode === 403
  );
});

test('un alumno no puede crear una inscripción a carrera aunque la ruta exista', async () => {
  await assert.rejects(
    inscripcionCarreraService.inscribirAlumno(
      { usuarioId: 8, carreraId: 2, cicloLectivo: 2026 },
      { id: 8, rol: ROLES.ALUMNO }
    ),
    (error: any) => error.statusCode === 403
  );
});

test('el catálogo de carreras fuerza solo carreras activas', async () => {
  let received: unknown;
  replaceMethod(carreraRepository, 'findAll', async (filters: unknown) => {
    received = filters;
    return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } };
  });

  await carreraService.listCatalogo({ page: 2, limit: 5, search: 'Inicial' });

  assert.deepEqual(received, { page: 2, limit: 5, search: 'Inicial', activo: true });
});

test('el profesor obtiene cursadas propias por docente directo o asignación activa', async () => {
  let received: unknown;
  replaceMethod(cursadaRepository, 'findAllForProfesor', async (filters: unknown) => {
    received = filters;
    return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } };
  });

  await cursadaService.getCursadas(
    { anioLectivo: 2026, page: 1, limit: 20 },
    { id: 8, rol: ROLES.PROFESOR }
  );

  assert.deepEqual(received, { anioLectivo: 2026, page: 1, limit: 20, profesorId: 8 });
});

test('un profesor que no integra el tribunal no puede registrar una nota final', async () => {
  replaceMethod(examenRepository, 'findExamenById', async () => ({
    id: 6,
    materiaId: 14,
    tribunales: [{ profesorId: 99 }]
  }) as any);
  replaceMethod(materiaRepository, 'findById', async () => ({ notaMinima: 6 }) as any);
  let persisted = false;
  replaceMethod(examenRepository, 'registrarNota', async () => {
    persisted = true;
    return {};
  });

  await assert.rejects(
    examenService.registrarNota(6, 13, 8, { id: 8, rol: ROLES.PROFESOR }),
    (error: any) => error.statusCode === 403
  );
  assert.equal(persisted, false);
});

test('un profesor no puede consultar la trayectoria integral de un alumno', async () => {
  const trayectoriaService = (await import('../src/services/estadoAcademicoService.js')).default;
  await assert.rejects(
    trayectoriaService.getTrayectoriaIntegral(
      8,
      1,
      { id: 8, rol: ROLES.PROFESOR }
    ),
    (error: any) => error.statusCode === 403
  );
});

test('la trayectoria integral contiene una sola entrada por materia y conserva pendientes y aprobaciones', async () => {
  replaceMethod(alumnoRepository, 'findByUsuarioId', async () => ({ idAlumno: 4 }) as any);
  replaceMethod(carreraRepository, 'getPlanEstudio', async () => ({
    id: 1,
    nombre: 'Profesorado',
    duracionAnios: 4,
    activo: true,
    materias: [
      { id: 10, nombre: 'Final', carreraId: 1, cursoId: 1, curso: { id: 1, anio: 1 }, notaMinima: 6, notaPromocion: 8, asistenciaRequerida: 75, tpRequeridos: 75, esPromocionable: false, aniosRegularidad: 3 },
      { id: 11, nombre: 'Pendiente', carreraId: 1, cursoId: 1, curso: { id: 1, anio: 1 }, notaMinima: 6, notaPromocion: 8, asistenciaRequerida: 75, tpRequeridos: 75, esPromocionable: false, aniosRegularidad: 3 },
      { id: 12, nombre: 'Homologada', carreraId: 1, cursoId: 2, curso: { id: 2, anio: 2 }, notaMinima: 6, notaPromocion: 8, asistenciaRequerida: 75, tpRequeridos: 75, esPromocionable: false, aniosRegularidad: 3 }
    ]
  }) as any);
  replaceMethod(prisma.inscripcionMateria, 'findMany', async () => [{
    id: 1,
    materiaId: 10,
    cicloLectivo: 2026,
    modalidadElegida: 'PRESENCIAL',
    estado: 'ACTIVA',
    fechaInscripcion: new Date('2026-03-01'),
    fechaBaja: null,
    materia: { id: 10, nombre: 'Final', carreraId: 1, notaMinima: 6, notaPromocion: 8, asistenciaRequerida: 75, tpRequeridos: 75, esPromocionable: false, aniosRegularidad: 3 },
    cursada: {
      id: 100,
      materiaId: 10,
      anioLectivo: 2026,
      periodo: 'ANUAL',
      activo: true,
      materia: { id: 10, nombre: 'Final', carreraId: 1, notaMinima: 6, notaPromocion: 8, asistenciaRequerida: 75, tpRequeridos: 75, esPromocionable: false, aniosRegularidad: 3 },
      calificaciones: [
        { id: 1, alumnoId: 4, tipoCalificacion: 'PARCIAL', numero: 1, nota: 8 },
        { id: 2, alumnoId: 4, tipoCalificacion: 'TRABAJO_PRACTICO', numero: 1, nota: 8 }
      ],
      asistencias: [{ alumnoId: 4, fecha: new Date('2026-04-01'), presente: true, justificado: false }]
    }
  }] as any);
  replaceMethod(prisma.inscripcionExamen, 'findMany', async () => [{ mesaId: 7, notaFinal: 7, aprobado: true, updatedAt: new Date('2026-08-01'), mesa: { materiaId: 10, materia: { id: 10 } } }] as any);
  replaceMethod(prisma.homologacion, 'findMany', async () => [{ id: 8, materiaId: 12, tipoHomologacion: 'TOTAL', calificacion: 9, fechaHomologacion: new Date('2026-05-01'), materia: { id: 12 } }] as any);

  const trayectoria = await (await import('../src/services/estadoAcademicoService.js')).default.getTrayectoriaIntegral(
    8,
    1,
    { id: 8, rol: ROLES.ALUMNO }
  );

  assert.equal(trayectoria.materias.length, 3);
  assert.deepEqual(trayectoria.materias.map((materia: any) => materia.estado), ['APROBADA', 'PENDIENTE', 'HOMOLOGADA']);
  assert.equal(new Set(trayectoria.materias.map((materia: any) => materia.materia.id)).size, 3);
});
