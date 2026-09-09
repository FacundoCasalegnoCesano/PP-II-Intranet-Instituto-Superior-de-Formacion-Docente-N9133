import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, test } from 'node:test';
import { parse } from 'yaml';

import materiaRepository from '../src/repositories/materiaRepository.js';
import inscripcionMateriaController from '../src/controllers/inscripcionMateriaController.js';
import examenController from '../src/controllers/examenController.js';
import inscripcionMateriaService from '../src/services/inscripcionMateriaService.js';
import examenService from '../src/services/examenService.js';
import { ROLES } from '../src/constants/roles.js';
import { prisma } from '../src/config/prisma.js';

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

function parseOpenApi(): any {
  return parse(readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8'));
}

function schemaRef(document: any, path: string, method: string, status = '200'): string | undefined {
  return document.paths[path][method].responses[status]?.content?.['application/json']?.schema?.$ref;
}

test('OpenAPI enlaza contratos académicos, conserva horarios publicados y enumera estados reales', () => {
  const document = parseOpenApi();

  assert.equal(schemaRef(document, '/inscripciones-materias/disponibles', 'get'), '#/components/schemas/MateriasDisponiblesResponse');
  assert.equal(schemaRef(document, '/inscripciones-materias/verificar/{materiaId}', 'get'), '#/components/schemas/VerificacionInscripcionMateriaResponse');
  assert.equal(schemaRef(document, '/inscripciones-materias/alumno/{alumnoId}', 'get'), '#/components/schemas/InscripcionesMateriaResponse');
  assert.equal(schemaRef(document, '/inscripciones-materias/historial/{alumnoId}/{materiaId}', 'get'), '#/components/schemas/HistorialInscripcionMateriaResponse');
  assert.equal(schemaRef(document, '/inscripciones-carreras/alumno/{alumnoId}', 'get'), '#/components/schemas/InscripcionesCarreraResponse');
  assert.equal(schemaRef(document, '/examenes/alumno/{alumnoId}/inscripciones', 'get'), '#/components/schemas/InscripcionesExamenResponse');
  assert.equal(schemaRef(document, '/estado-academico/alumno/{alumnoId}/trayectoria', 'get'), '#/components/schemas/TrayectoriaAcademicaResponse');
  assert.equal(schemaRef(document, '/estado-academico/alumno/{alumnoId}', 'get'), '#/components/schemas/EstadoAcademicoAlumnoResponse');
  assert.equal(schemaRef(document, '/inscripciones-materias', 'post', '201'), '#/components/schemas/InscripcionMateriaMutationResponse');
  assert.equal(schemaRef(document, '/inscripciones-materias/{id}', 'delete'), '#/components/schemas/InscripcionMateriaMutationResponse');
  assert.equal(schemaRef(document, '/examenes/{examenId}/inscribir', 'post', '201'), '#/components/schemas/InscripcionExamenMutationResponse');
  assert.equal(schemaRef(document, '/examenes/{examenId}/desinscribir', 'post'), '#/components/schemas/InscripcionExamenMutationResponse');

  assert.equal(schemaRef(document, '/horarios-publicados/actual', 'get'), '#/components/schemas/HorarioPublicadoResponse');
  assert.equal(schemaRef(document, '/horarios-publicados/historial', 'get'), '#/components/schemas/HistorialHorarioPublicadoResponse');
  assert.equal(schemaRef(document, '/horarios-publicados/{id}/publicar', 'post'), '#/components/schemas/HorarioPublicadoMutationResponse');

  for (const path of [
    '/inscripciones-carreras/alumno/{alumnoId}',
    '/inscripciones-materias/alumno/{alumnoId}',
    '/inscripciones-materias/historial/{alumnoId}/{materiaId}',
    '/examenes/alumno/{alumnoId}/inscripciones',
    '/estado-academico/alumno/{alumnoId}/trayectoria'
  ]) {
    assert.match(document.paths[path].get.description, /Usuario\.idUsuario/);
  }
  const materiaRequest = document.components.schemas.InscripcionMateriaRequest;
  assert.ok(materiaRequest.properties.modalidadElegida);
  assert.equal(materiaRequest.properties.modalidad, undefined);
  const materiaDisponible = document.components.schemas.MateriaDisponibleAlumno;
  assert.equal(materiaDisponible.properties.modalidad.$ref, '#/components/schemas/Modalidad');
  assert.equal(materiaDisponible.properties.modalidadElegida, undefined);
  const verificacion = document.components.schemas.VerificacionInscripcionMateriaResponse;
  assert.equal(verificacion.properties.data.properties.puedeInscribirse.type, 'boolean');
  assert.equal(verificacion.properties.data.properties.materia.$ref, '#/components/schemas/MateriaDisponibleAlumno');
  assert.equal(document.components.schemas.TribunalRequest.properties.mesaId.type, 'integer');
  assert.deepEqual(document.components.schemas.TrayectoriaMateria.properties.estado.enum, [
    'PENDIENTE', 'EN_CURSO', 'LIBRE', 'REGULAR', 'HABILITADO_PROMOCION', 'PROMOCIONADO', 'APROBADA', 'HOMOLOGADA'
  ]);
});

test('la consulta de disponibilidad de materias no carga horarios estructurados', async () => {
  let consulta: any;
  replaceMethod(prisma.materia as unknown as Record<string, unknown>, 'findMany', async (args: any) => {
    consulta = args;
    return [];
  });
  replaceMethod(prisma.inscripcionMateria as unknown as Record<string, unknown>, 'findMany', async () => []);
  replaceMethod(prisma.calificacion as unknown as Record<string, unknown>, 'findMany', async () => []);

  await materiaRepository.getMateriasDisponibles(4, [2], 2026);
  assert.deepEqual(consulta.include.cursadas, { where: { activo: true } });
});

test('un alumno se inscribe a una materia con la identidad del JWT y modalidadElegida', async () => {
  let recibido: any;
  replaceMethod(inscripcionMateriaService, 'inscribirAlumno', async (data: any, user: any) => {
    recibido = { data, user };
    return { id: 1 };
  });
  const req: any = {
    user: { id: 10, rol: ROLES.ALUMNO },
    body: { alumnoId: 999, materiaId: 7, modalidadElegida: 'SEMIPRESENCIAL' }
  };
  let respuesta: any;
  await inscripcionMateriaController.inscribirAlumno(req, {
    status: () => ({ json: (payload: any) => { respuesta = payload; } })
  } as any, (error: unknown) => { throw error; });

  assert.equal(recibido.data.alumnoId, 10);
  assert.equal(recibido.data.modalidadElegida, 'SEMIPRESENCIAL');
  assert.equal(respuesta.success, true);
});

test('el cambio administrativo de modalidad usa modalidadElegida', async () => {
  let recibido: any;
  replaceMethod(inscripcionMateriaService, 'cambiarModalidad', async (...args: any[]) => {
    recibido = args;
    return { id: 1 };
  });
  const user = { id: 1, rol: ROLES.ADMINISTRATIVO };
  await inscripcionMateriaController.cambiarModalidad({
    params: { id: '1' }, body: { modalidadElegida: 'LIBRE' }, user
  } as any, { status: () => ({ json: () => undefined }), json: () => undefined } as any, (error: unknown) => { throw error; });

  assert.deepEqual(recibido, [1, 'LIBRE', user]);
});

test('un alumno se inscribe y desinscribe de una mesa con la identidad del JWT', async () => {
  const llamadas: any[] = [];
  replaceMethod(examenService, 'inscribirAlumno', async (...args: any[]) => {
    llamadas.push(['alta', args]);
    return { id: 1 };
  });
  replaceMethod(examenService, 'desinscribirAlumno', async (...args: any[]) => {
    llamadas.push(['baja', args]);
    return { id: 1 };
  });
  const user = { id: 10, rol: ROLES.ALUMNO };
  const response = { status: () => ({ json: () => undefined }), json: () => undefined } as any;
  const next = (error: unknown) => { throw error; };

  await examenController.inscribirAlumno({ params: { examenId: '3' }, body: { alumnoId: 999, condicion: 'LIBRE' }, user } as any, response, next);
  await examenController.desinscribirAlumno({ params: { examenId: '3' }, body: { alumnoId: 999 }, user } as any, response, next);

  assert.deepEqual(llamadas, [
    ['alta', [3, 10, 'LIBRE', user]],
    ['baja', [3, 10, user]]
  ]);
});
