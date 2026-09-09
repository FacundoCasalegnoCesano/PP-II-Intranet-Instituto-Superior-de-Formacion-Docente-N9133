import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import YAML from 'yaml';

const openapiUrl = [
  new URL('../openapi.yaml', import.meta.url),
  new URL('../../openapi.yaml', import.meta.url)
].find(url => existsSync(url));
if (!openapiUrl) throw new Error('No se encontró backend/openapi.yaml');
const openapi = readFileSync(openapiUrl, 'utf8');
const document = YAML.parse(openapi) as any;

test('documenta los contratos públicos de calificaciones y resumen por cursada', () => {
  const operation = document.paths['/calificaciones/cursada/{cursadaId}'].get;
  assert.ok(operation);
  const parameters = operation.parameters;
  const parameter = (name: string) => parameters.find((item: any) => item.name === name);

  assert.equal(parameter('cursadaId').in, 'path');
  assert.equal(parameter('cursadaId').required, true);
  assert.equal(parameter('tipo').in, 'query');
  assert.equal(parameter('numero').schema.type, 'integer');
  assert.equal(parameter('alumnoId').in, 'query');
  assert.match(parameter('alumnoId').description, /Usuario\.idUsuario/);

  assert.equal(
    operation.responses['200'].content['application/json'].schema.$ref,
    '#/components/schemas/CalificacionesCursadaResponse'
  );
  const calificacion = document.components.schemas.CalificacionCursada;
  assert.deepEqual(calificacion.properties.fechaEvaluacion, {
    type: 'string', format: 'date', nullable: true
  });
  assert.equal(calificacion.properties.alumno.properties.alumnoId.description, 'Usuario.idUsuario público');
  assert.equal('idAlumno' in calificacion.properties.alumno.properties, false);
});

test('documenta las cuatro operaciones de clases, correlativasIds y el resumen académico', () => {
  const classes = document.paths['/cursadas/{cursadaId}/clases'];
  const classDetail = document.paths['/cursadas/{cursadaId}/clases/{fecha}'];
  assert.ok(classes.get);
  assert.deepEqual(Object.keys(classDetail).sort(), ['delete', 'get', 'put']);
  assert.equal(
    classDetail.get.responses['200'].content['application/json'].schema.$ref,
    '#/components/schemas/ClaseDetalleResponse'
  );
  assert.equal(
    classDetail.put.responses['200'].content['application/json'].schema.$ref,
    '#/components/schemas/ClaseGuardadaResponse'
  );
  const detalle = document.components.schemas.ClaseDetalle;
  const asistencia = detalle.allOf[1].properties.asistencias.items.allOf[1];
  assert.deepEqual(asistencia.required, ['nombre', 'dni']);
  assert.equal(asistencia.properties.nombre.type, 'string');
  assert.equal('apellidoNombre' in asistencia.properties, false);
  const guardado = document.components.schemas.ClaseGuardada;
  assert.deepEqual(guardado.required, ['fecha', 'temaDesarrollado', 'registros']);
  assert.equal(guardado.properties.registros.type, 'integer');
  assert.ok(document.paths['/estado-academico/cursada/{cursadaId}'].get);

  for (const schemaName of ['MateriaCreateRequest', 'MateriaUpdateRequest']) {
    const schema = document.components.schemas[schemaName];
    assert.equal(schema.properties.correlativasIds.type, 'array');
    assert.equal(schema.properties.correlativasIds.items.type, 'integer');
  }
  assert.equal(document.components.schemas.MateriaUpdateRequest.properties.correlativasIds.nullable, undefined);

  const correlatividadRequest = document.components.schemas.CorrelatividadRequest;
  assert.deepEqual(Object.keys(correlatividadRequest.properties), ['materiaRequeridaId']);
  assert.equal(correlatividadRequest.properties.tipoRequisito, undefined);

  const resumen = document.components.schemas.EstadoAcademicoCursadaAlumno;
  assert.equal(resumen.properties.requisitosPendientes.type, 'array');
  assert.deepEqual(resumen.properties.requisitosPendientes.items.enum, [
    'ASISTENCIA', 'PARCIALES', 'TRABAJOS_PRACTICOS', 'REGULARIDAD', 'INSTANCIA_INTEGRADORA'
  ]);
  assert.equal(
    document.paths['/estado-academico/cursada/{cursadaId}'].get.responses['200']
      .content['application/json'].schema.$ref,
    '#/components/schemas/EstadoAcademicoCursadaResponse'
  );
});
