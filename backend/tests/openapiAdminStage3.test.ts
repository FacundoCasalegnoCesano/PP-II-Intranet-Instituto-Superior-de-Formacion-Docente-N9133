import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const openapi = readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8');

test('OpenAPI documenta el detalle administrativo y la sincronizacion del rol Alumno', () => {
  assert.match(openapi, /AdminUserDetail:[\s\S]*?roles:[\s\S]*?alumno:/);
  assert.match(openapi, /AlumnoProfile:[\s\S]*?domicilio:[\s\S]*?anioEgreso:[\s\S]*?institucionProcedencia:/);
  assert.match(openapi, /UserUpdateRequest:[\s\S]*?alumno:[\s\S]*?AlumnoProfileUpdate/);
  assert.match(openapi, /ChangeRoleRequest:[\s\S]*?rol:[\s\S]*?alumno:[\s\S]*?AlumnoProfileInput/);
  assert.match(openapi, /\/users\/\{id\}:[\s\S]*?delete:[\s\S]*?baja l.gica/i);
});

test('OpenAPI documenta carrera, materia, correlativa y designacion con cursoAnio compatible', () => {
  assert.match(openapi, /Career:[\s\S]*?duracionAnios:[\s\S]*?activo:/);
  assert.match(openapi, /Subject:[\s\S]*?carrera:[\s\S]*?curso:/);
  assert.match(openapi, /Prerequisite:[\s\S]*?materiaRequerida:/);
  assert.match(openapi, /TeachingAssignment:[\s\S]*?profesor:/);
  assert.match(openapi, /MateriaCreateRequest:[\s\S]*?anyOf:[\s\S]*?cursoAnio:[\s\S]*?cursoId:/);
});

test('OpenAPI documenta cursadas, horarios y periodos con filtro por ciclo lectivo', () => {
  assert.match(openapi, /CourseOffering:[\s\S]*?materia:[\s\S]*?anioLectivo:[\s\S]*?periodo:[\s\S]*?horarios:/);
  assert.match(openapi, /Schedule:[\s\S]*?dia:[\s\S]*?horaInicio:[\s\S]*?horaFin:/);
  assert.match(openapi, /EnrollmentPeriod:[\s\S]*?cicloLectivo:[\s\S]*?materias:[\s\S]*?mesas:/);
  assert.match(openapi, /\/periodos-inscripcion:[\s\S]*?name: cicloLectivo/);
  assert.match(openapi, /PeriodoRequest:[\s\S]*?required: \[tipo, cicloLectivo, fechaInicio, fechaFin\][\s\S]*?materiasIds:/);
});
