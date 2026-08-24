import { mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { prisma } from '../src/config/prisma.ts';

const base = process.env.API_BASE_URL ?? 'http://localhost:3000/api';
const results = [];
const sensitiveBodyFields = new Set([
  'password', 'passwordHash', 'currentPassword', 'newPassword',
  'refreshToken', 'accessToken', 'token', 'code', 'codes', 'backupCodes'
]);

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

const adminPassword = requiredEnv('TEST_ADMIN_PASSWORD');
const profesorPassword = requiredEnv('TEST_PROFESOR_PASSWORD');
const alumnoPassword = requiredEnv('TEST_ALUMNO_PASSWORD');
const randomPassword = () => `Aa1!${randomBytes(12).toString('hex')}`;
const alumnoNuevoPassword = randomPassword();
const profesorNuevoPassword = randomPassword();
const adminNuevoPassword = randomPassword();
const registradoPassword = randomPassword();
const registradoNuevaPassword = randomPassword();
const adminRecuperadaPassword = randomPassword();
const alumnoBajaPassword = randomPassword();

function documentedBody(body) {
  if (body === undefined) return null;
  return JSON.parse(JSON.stringify(body, (key, value) => (
    sensitiveBodyFields.has(key) ? `<${key}>` : value
  )));
}

function compactExample(value, depth = 0) {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'string') return value.length > 300 ? `${value.slice(0, 300)}…` : value;
  if (typeof value !== 'object') return value;
  if (depth >= 4) return '[detalle omitido]';
  if (Array.isArray(value)) {
    return value.length === 0 ? [] : [compactExample(value[0], depth + 1)];
  }

  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 20)
      .map(([key, nestedValue]) => [
        key,
        sensitiveBodyFields.has(key) ? `<${key}>` : compactExample(nestedValue, depth + 1)
      ])
  );
}

function documentedResponse(method, status, payload) {
  if (method === 'DELETE' && status < 400) {
    return typeof payload?.message === 'string' ? payload.message : compactExample(payload);
  }
  if (method === 'GET') return compactExample(payload);
  return null;
}

async function call(modulo, rol, metodo, endpoint, descripcion, body, token, expected = [200, 201]) {
  const response = await fetch(`${base}${endpoint}`, {
    method: metodo,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  let payload;
  try { payload = await response.json(); } catch { payload = null; }
  results.push({
    modulo,
    rol,
    metodo,
    endpoint,
    descripcion: `[${rol}] ${descripcion}`,
    body: documentedBody(body),
    respuesta: documentedResponse(metodo, response.status, payload),
    codigo: response.status
  });
  if (!expected.includes(response.status)) {
    process.stderr.write(`${metodo} ${endpoint} -> ${response.status} ${JSON.stringify(payload)}\n`);
  }
  return { status: response.status, payload };
}

async function login(identifier, password, role) {
  const first = await call('Auth', role, 'POST', '/auth/login', 'Iniciar sesión', { identifier, password }, null);
  const loginToken = first.payload?.data?.accessToken ?? first.payload?.data?.token;
  const refreshToken = first.payload?.data?.refreshToken;
  if (!loginToken) throw new Error(`No se pudo iniciar sesión como ${role}`);
  const selected = await call('Auth', role, 'POST', '/auth/select-role', 'Seleccionar rol', { role }, loginToken);
  const token = selected.payload?.data?.accessToken ?? selected.payload?.data?.token;
  if (!token) throw new Error(`No se pudo seleccionar ${role}`);
  return { token, refreshToken: selected.payload?.data?.refreshToken ?? refreshToken };
}

function data(result) { return result.payload?.data; }
function idOf(result) {
  const value = data(result);
  return value?.idUsuario ?? value?.id ?? value?.idCuenta ?? value?.idLibroDeTema ?? value?.usuario?.idUsuario;
}
function requireId(result, label) {
  const id = idOf(result);
  if (!id) throw new Error(`No se obtuvo el ID de ${label}; se cancela el flujo para proteger datos existentes`);
  return id;
}

const stamp = String(Date.now()).slice(-6);
const admin = await login('admin@instituto.edu.ar', adminPassword, 'ADMINISTRATIVO');
const profesor = await login('jorge.rodriguez@instituto.edu.ar', profesorPassword, 'PROFESOR');
const alumno = await login('lucia.fernandez@instituto.edu.ar', alumnoPassword, 'ALUMNO');

await call('General', 'PUBLICO', 'GET', '/health', 'Verificar disponibilidad del servicio');
await call('General', 'PUBLICO', 'GET', '/', 'Consultar índice de recursos');
for (const [rol, session] of [['ADMINISTRATIVO', admin], ['PROFESOR', profesor], ['ALUMNO', alumno]]) {
  await call('Auth', rol, 'GET', '/auth/me', 'Consultar perfil propio', undefined, session.token);
}
await call('Auth', 'ADMINISTRATIVO', 'POST', '/auth/my-backup-codes/reveal', 'Revelar códigos de respaldo', { currentPassword: adminPassword }, admin.token);

const newAlumno = await call('Alumnos', 'ADMINISTRATIVO', 'POST', '/alumnos', 'Crear alumna', {
  apellidoNombre: 'Valentina Soledad Acosta', dni: `47${stamp}`.slice(0, 8), rol: 'ALUMNO',
  email: `valentina.acosta.${stamp}@instituto.edu.ar`, fechaNacimiento: '2005-04-18',
  telefono: '3424557812', password: alumnoNuevoPassword, cuil: `27${`47${stamp}`.slice(0, 8)}3`,
  domicilio: 'San Martín 1842, Santa Fe', anioEgreso: 2023,
  institucionProcedencia: 'Escuela Normal Superior N.º 32'
}, admin.token);
const newProfesor = await call('Profesores', 'ADMINISTRATIVO', 'POST', '/profesores', 'Crear profesor', {
  apellidoNombre: 'Martín Alejandro Benítez', dni: `31${stamp}`.slice(0, 8), rol: 'PROFESOR',
  email: `martin.benitez.${stamp}@instituto.edu.ar`, fechaNacimiento: '1987-09-12',
  telefono: '3424661930', password: profesorNuevoPassword, cuil: `20${String(`31${stamp}`).slice(0, 8)}7`.slice(0, 11)
}, admin.token);
const newAdmin = await call('Administrativos', 'ADMINISTRATIVO', 'POST', '/administrativos', 'Crear administrativa', {
  apellidoNombre: 'Carolina Inés Ramírez', dni: `35${stamp}`.slice(0, 8), rol: 'ADMINISTRATIVO',
  email: `carolina.ramirez.${stamp}@instituto.edu.ar`, fechaNacimiento: '1991-02-23',
  telefono: '3424772051', password: adminNuevoPassword, cuil: `27${String(`35${stamp}`).slice(0, 8)}4`.slice(0, 11)
}, admin.token);
const alumnoNuevoId = requireId(newAlumno, 'la alumna creada');
const profesorNuevoId = requireId(newProfesor, 'el profesor creado');
const adminNuevoId = requireId(newAdmin, 'la administrativa creada');

for (const [modulo, path, id] of [['Alumnos','alumnos',alumnoNuevoId],['Profesores','profesores',profesorNuevoId],['Administrativos','administrativos',adminNuevoId]]) {
  await call(modulo, 'ADMINISTRATIVO', 'GET', `/${path}?page=1&limit=20`, `Listar ${path}`, undefined, admin.token);
  await call(modulo, 'ADMINISTRATIVO', 'GET', `/${path}/estadisticas`, `Consultar estadísticas de ${path}`, undefined, admin.token);
  if (id) {
    await call(modulo, 'ADMINISTRATIVO', 'GET', `/${path}/${id}`, `Consultar ${path} por ID`, undefined, admin.token);
    await call(modulo, 'ADMINISTRATIVO', 'PUT', `/${path}/${id}`, `Actualizar ${path}`, { telefono: '3424559000' }, admin.token);
  }
}
await call('Profesores', 'ADMINISTRATIVO', 'GET', '/profesores/12/materias', 'Consultar materias del profesor', undefined, admin.token);

await call('Usuarios', 'ADMINISTRATIVO', 'GET', '/users?page=1&limit=20', 'Listar usuarios paginados', undefined, admin.token);
await call('Usuarios', 'ADMINISTRATIVO', 'GET', '/users/13', 'Consultar usuario', undefined, admin.token);
await call('Usuarios', 'ALUMNO', 'GET', '/users/13', 'Consultar cuenta propia', undefined, alumno.token);
await call('Usuarios', 'ADMINISTRATIVO', 'PUT', '/users/13', 'Actualizar usuario', { telefono: '3424881364' }, admin.token);
if (adminNuevoId) {
  await call('Usuarios', 'ADMINISTRATIVO', 'PUT', `/users/${adminNuevoId}/activate`, 'Activar usuario', { active: true }, admin.token);
  await call('Usuarios', 'ADMINISTRATIVO', 'PUT', `/users/${adminNuevoId}/role`, 'Agregar rol al usuario', { rol: 'PROFESOR' }, admin.token);
}

const registrado = await call('Auth', 'ADMINISTRATIVO', 'POST', '/auth/register', 'Registrar usuario', {
  apellidoNombre: 'Agustina Belén Quiroga', dni: `28${stamp}`.slice(0, 8),
  email: `agustina.quiroga.${stamp}@instituto.edu.ar`, fechaNacimiento: '1983-07-09',
  telefono: '3424892160', password: registradoPassword, cuil: `27${`28${stamp}`.slice(0, 8)}5`,
  rol: 'PROFESOR'
}, admin.token);
const registradoId = requireId(registrado, 'el usuario registrado');
const registradoSession = await login(`agustina.quiroga.${stamp}@instituto.edu.ar`, registradoPassword, 'PROFESOR');
await call('Auth', 'PROFESOR', 'PUT', '/auth/change-password', 'Cambiar contraseña propia', {
  currentPassword: registradoPassword, newPassword: registradoNuevaPassword
}, registradoSession.token);
const registradoNuevaSession = await login(`agustina.quiroga.${stamp}@instituto.edu.ar`, registradoNuevaPassword, 'PROFESOR');
await call('Auth', 'PROFESOR', 'POST', '/auth/logout', 'Cerrar sesión', undefined, registradoNuevaSession.token);

const adminNuevoSession = await login(`carolina.ramirez.${stamp}@instituto.edu.ar`, adminNuevoPassword, 'ADMINISTRATIVO');
const regenerated = await call('Auth', 'ADMINISTRATIVO', 'POST', '/auth/my-backup-codes/regenerate', 'Regenerar códigos de respaldo', {
  currentPassword: adminNuevoPassword
}, adminNuevoSession.token);
const backupCode = data(regenerated)?.codes?.[0];
if (backupCode) {
  await call('Auth', 'PUBLICO', 'POST', '/auth/admin/backup-code', 'Recuperar cuenta administrativa con código de respaldo', {
    email: `carolina.ramirez.${stamp}@instituto.edu.ar`, code: backupCode,
    newPassword: adminRecuperadaPassword
  });
}
const alumnoNuevoSession = await login(`valentina.acosta.${stamp}@instituto.edu.ar`, alumnoNuevoPassword, 'ALUMNO');

const carrera = await call('Carreras', 'ADMINISTRATIVO', 'POST', '/carreras', 'Crear carrera', {
  nombre: `Tecnicatura Superior en Gestión Cultural ${stamp}`, duracionAnios: 3
}, admin.token);
const carreraId = requireId(carrera, 'la carrera creada');
await call('Carreras', 'ADMINISTRATIVO', 'GET', '/carreras?page=1&limit=20', 'Listar carreras', undefined, admin.token);
await call('Carreras', 'PROFESOR', 'GET', '/carreras?page=1&limit=20', 'Listar carreras', undefined, profesor.token);
await call('Carreras', 'ADMINISTRATIVO', 'GET', `/carreras/${carreraId}`, 'Consultar carrera', undefined, admin.token);
await call('Carreras', 'ADMINISTRATIVO', 'GET', `/carreras/${carreraId}/plan-estudio`, 'Consultar plan de estudio', undefined, admin.token);
await call('Carreras', 'ADMINISTRATIVO', 'PUT', `/carreras/${carreraId}`, 'Actualizar carrera', { duracionAnios: 4 }, admin.token);

const inscripcionCarreraAdmin = await call('Inscripciones a carreras', 'ADMINISTRATIVO', 'POST', '/inscripciones-carreras', 'Inscribir alumna en una carrera', {
  alumnoId: alumnoNuevoId, carreraId: 3, cicloLectivo: 2026
}, admin.token);
const inscripcionCarreraAlumno = await call('Inscripciones a carreras', 'ALUMNO', 'POST', '/inscripciones-carreras', 'Inscribirse en una carrera', {
  carreraId, cicloLectivo: 2026
}, alumnoNuevoSession.token);
for (const [rol, token] of [['ADMINISTRATIVO', admin.token], ['ALUMNO', alumnoNuevoSession.token]]) {
  await call('Inscripciones a carreras', rol, 'GET', `/inscripciones-carreras/alumno/${alumnoNuevoId}`, 'Consultar carreras de la alumna', undefined, token);
}
await call('Inscripciones a carreras', 'ADMINISTRATIVO', 'GET', '/inscripciones-carreras/carrera/3/inscriptos?page=1&limit=20', 'Listar inscriptos de la carrera', undefined, admin.token);

const curso = await prisma.curso.findFirst({ where: { activo: true }, orderBy: { id: 'asc' } });
if (!curso) throw new Error('No existe un curso activo para crear la materia de prueba');
const materia = await call('Materias', 'ADMINISTRATIVO', 'POST', '/materias', 'Crear materia', {
  nombre: `Producción y Gestión de Proyectos Culturales ${stamp}`,
  descripcion: 'Planificación, producción y evaluación de proyectos culturales comunitarios.',
  cargaHoraria: 96, horasCatedra: '6 horas semanales', tipoEspacio: 'MATERIA', modalidad: 'PRESENCIAL',
  periodo: 'ANUAL', regimen: 'REGULAR_PRESENCIAL_SIN_PROMOCION', notaMinima: 6,
  asistenciaRequerida: 75, tpRequeridos: 75, esPromocionable: false, notaPromocion: 8,
  aniosRegularidad: 3, carreraId: 3, cursoId: curso.id
}, admin.token);
const materiaId = requireId(materia, 'la materia creada');
for (const [rol, token] of [['ADMINISTRATIVO',admin.token],['PROFESOR',profesor.token]]) {
  await call('Materias', rol, 'GET', '/materias?page=1&limit=20', 'Listar materias', undefined, token);
  await call('Materias', rol, 'GET', `/materias/carrera/${carreraId}`, 'Listar materias por carrera', undefined, token);
  await call('Materias', rol, 'GET', `/materias/carrera/${carreraId}/por-anio`, 'Agrupar materias por año', undefined, token);
  await call('Materias', rol, 'GET', `/materias/${materiaId}`, 'Consultar materia', undefined, token);
  await call('Materias', rol, 'GET', `/materias/${materiaId}/correlatividades`, 'Consultar correlatividades', undefined, token);
}
await call('Materias', 'ADMINISTRATIVO', 'PUT', `/materias/${materiaId}`, 'Actualizar materia', { cargaHoraria: 100 }, admin.token);
const correlatividad = await call('Materias', 'ADMINISTRATIVO', 'POST', `/materias/${materiaId}/correlatividades`, 'Agregar correlatividad', {
  materiaRequeridaId: 14, tipoRequisito: 'OBLIGATORIA', aplicaCursado: true, aplicaRendir: true
}, admin.token);
const correlatividadId = idOf(correlatividad);
if (correlatividadId) {
  await call('Materias', 'ADMINISTRATIVO', 'DELETE', `/materias/correlatividades/${correlatividadId}`, 'Quitar correlatividad', undefined, admin.token);
}
await call('Materias', 'ADMINISTRATIVO', 'POST', `/materias/${materiaId}/profesores`, 'Asignar profesor', { profesorId: 12 }, admin.token);
await call('Materias', 'ADMINISTRATIVO', 'GET', `/materias/${materiaId}/profesores`, 'Listar profesores asignados', undefined, admin.token);
await call('Materias', 'PROFESOR', 'GET', `/materias/${materiaId}/profesores`, 'Listar profesores asignados', undefined, profesor.token);

const cursada = await call('Cursadas', 'ADMINISTRATIVO', 'POST', '/cursadas', 'Crear cursada', {
  materiaId, anioLectivo: 2026, periodo: 'ANUAL', docenteId: 12
}, admin.token);
const cursadaId = requireId(cursada, 'la cursada creada');
for (const [rol, token] of [['ADMINISTRATIVO',admin.token],['PROFESOR',profesor.token]]) {
  await call('Cursadas', rol, 'GET', '/cursadas?page=1&limit=20', 'Listar cursadas', undefined, token);
  await call('Cursadas', rol, 'GET', `/cursadas/${cursadaId}`, 'Consultar cursada', undefined, token);
  await call('Cursadas', rol, 'GET', `/cursadas/${cursadaId}/inscriptos`, 'Listar inscriptos', undefined, token);
}
await call('Cursadas', 'ADMINISTRATIVO', 'PUT', `/cursadas/${cursadaId}`, 'Actualizar cursada', { activo: true }, admin.token);

const horario = await call('Horarios', 'ADMINISTRATIVO', 'POST', '/horarios', 'Crear horario', {
  cursadaId, dia: 'MIERCOLES', horaInicio: '2026-01-01T18:00:00.000Z', horaFin: '2026-01-01T21:00:00.000Z', aula: 'Aula 5'
}, admin.token);
const horarioId = idOf(horario);
if (horarioId) {
  await call('Horarios', 'ADMINISTRATIVO', 'GET', `/horarios/${horarioId}`, 'Consultar horario', undefined, admin.token);
  await call('Horarios', 'ADMINISTRATIVO', 'PUT', `/horarios/${horarioId}`, 'Actualizar horario', { aula: 'Aula 7' }, admin.token);
}
for (const [rol, token] of [['ADMINISTRATIVO',admin.token],['PROFESOR',profesor.token]]) {
  await call('Horarios', rol, 'GET', `/horarios/cursada/${cursadaId}`, 'Listar horarios por cursada', undefined, token);
  await call('Horarios', rol, 'GET', `/horarios/materia/${materiaId}`, 'Listar horarios por materia', undefined, token);
}

for (const [rol, token] of [['ADMINISTRATIVO',admin.token],['PROFESOR',profesor.token],['ALUMNO',alumno.token]]) {
  await call('Períodos', rol, 'GET', '/periodos-inscripcion?page=1&limit=20', 'Listar períodos', undefined, token);
  await call('Períodos', rol, 'GET', '/periodos-inscripcion/activos/MATERIA', 'Listar períodos activos', undefined, token);
  await call('Períodos', rol, 'GET', '/periodos-inscripcion/verificar/MATERIA', 'Verificar inscripción habilitada', undefined, token);
}
const periodo = await call('Períodos', 'ADMINISTRATIVO', 'POST', '/periodos-inscripcion', 'Crear período de materias', {
  tipo: 'MATERIA', cicloLectivo: 2026, fechaInicio: '2026-08-01T00:00:00.000Z', fechaFin: '2026-09-30T23:59:59.000Z',
  materiasIds: [materiaId], descripcion: 'Inscripción a materias del segundo semestre 2026'
}, admin.token);
const periodoId = idOf(periodo);
if (periodoId) {
  await call('Períodos', 'ADMINISTRATIVO', 'GET', `/periodos-inscripcion/${periodoId}`, 'Consultar período', undefined, admin.token);
  await call('Períodos', 'PROFESOR', 'GET', `/periodos-inscripcion/${periodoId}`, 'Consultar período', undefined, profesor.token);
  await call('Períodos', 'ADMINISTRATIVO', 'PUT', `/periodos-inscripcion/${periodoId}`, 'Actualizar período', { descripcion: 'Inscripción ampliada del segundo semestre 2026' }, admin.token);
}

await call('Inscripciones a materias', 'ADMINISTRATIVO', 'GET', `/inscripciones-materias/verificar/${materiaId}?alumnoId=${alumnoNuevoId}&cicloLectivo=2026`, 'Verificar posibilidad de inscripción', undefined, admin.token);
await call('Inscripciones a materias', 'ALUMNO', 'GET', `/inscripciones-materias/verificar/${materiaId}?cicloLectivo=2026`, 'Verificar posibilidad de inscripción propia', undefined, alumnoNuevoSession.token);

const inscripcionMateriaAdmin = await call('Inscripciones a materias', 'ADMINISTRATIVO', 'POST', '/inscripciones-materias', 'Inscribir alumna en una materia', {
  alumnoId: 13, materiaId, cicloLectivo: 2026, modalidadElegida: 'PRESENCIAL', cursadaId
}, admin.token);
const inscripcionMateriaAlumno = await call('Inscripciones a materias', 'ALUMNO', 'POST', '/inscripciones-materias', 'Inscribirse en una materia', {
  materiaId, cicloLectivo: 2026, modalidadElegida: 'PRESENCIAL', cursadaId
}, alumnoNuevoSession.token);
const inscripcionMateriaAdminId = idOf(inscripcionMateriaAdmin);
const inscripcionMateriaAlumnoId = idOf(inscripcionMateriaAlumno);
if (inscripcionMateriaAdminId) {
  await call('Inscripciones a materias', 'ADMINISTRATIVO', 'PUT', `/inscripciones-materias/${inscripcionMateriaAdminId}/modalidad`, 'Cambiar modalidad de cursada', {
    modalidad: 'SEMIPRESENCIAL'
  }, admin.token);
}

for (const [rol, token] of [['ADMINISTRATIVO',admin.token],['ALUMNO',alumno.token]]) {
  const suffix = rol === 'ADMINISTRATIVO' ? '?alumnoId=13&cicloLectivo=2026' : '?cicloLectivo=2026';
  await call('Inscripciones a materias', rol, 'GET', `/inscripciones-materias/disponibles${suffix}`, 'Consultar materias disponibles', undefined, token);
  await call('Inscripciones a materias', rol, 'GET', '/inscripciones-materias/alumno/13?page=1&limit=20', 'Listar materias del alumno', undefined, token);
  await call('Inscripciones a materias', rol, 'GET', '/inscripciones-materias/historial/13/14', 'Consultar historial de materia', undefined, token);
}
await call('Inscripciones a materias', 'ADMINISTRATIVO', 'GET', '/inscripciones-materias/materia/14/inscriptos?page=1&limit=20', 'Listar inscriptos por materia', undefined, admin.token);
await call('Inscripciones a materias', 'PROFESOR', 'GET', '/inscripciones-materias/materia/14/inscriptos?page=1&limit=20', 'Listar inscriptos por materia', undefined, profesor.token);

for (const [rol, token] of [['ADMINISTRATIVO',admin.token],['PROFESOR',profesor.token]]) {
  await call('Asistencias', rol, 'POST', '/asistencias/carga-masiva', 'Cargar asistencia', {
    cursadaId: 12, fecha: rol === 'ADMINISTRATIVO' ? '2026-08-20' : '2026-08-21',
    asistencias: [{ alumnoId: 13, presente: true, justificado: false, observacion: 'Participación activa' }]
  }, token);
  await call('Asistencias', rol, 'GET', '/asistencias/cursada/12', 'Listar asistencias', undefined, token);
  await call('Asistencias', rol, 'GET', '/asistencias/resumen/12', 'Consultar resumen', undefined, token);
  await call('Calificaciones', rol, 'POST', '/calificaciones/carga-masiva', 'Cargar trabajo práctico', {
    cursadaId: 12,
    calificaciones: [{
      alumnoId: 13, tipoCalificacion: 'TRABAJO_PRACTICO',
      numero: rol === 'ADMINISTRATIVO' ? 2 : 3, nota: 9,
      observacion: 'Producción destacada'
    }]
  }, token);
  await call('Calificaciones', rol, 'GET', '/calificaciones/cursada/12', 'Listar calificaciones', undefined, token);
  await call('Calificaciones', rol, 'GET', '/calificaciones/resumen/12', 'Consultar resumen', undefined, token);
  await call('Estado académico', rol, 'GET', '/estado-academico/materia/14?cicloLectivo=2026', 'Consultar estado por materia', undefined, token);
}
for (const [rol, token] of [['ADMINISTRATIVO',admin.token],['PROFESOR',profesor.token],['ALUMNO',alumno.token]]) {
  await call('Asistencias', rol, 'GET', '/asistencias/alumno/13', 'Consultar asistencia del alumno', undefined, token);
  await call('Calificaciones', rol, 'GET', '/calificaciones/alumno/13', 'Consultar calificaciones del alumno', undefined, token);
  if (rol === 'ALUMNO') {
    await call('Calificaciones', rol, 'GET', '/calificaciones/mis-calificaciones', 'Consultar calificaciones propias', undefined, token);
  }
  await call('Estado académico', rol, 'GET', '/estado-academico/alumno/13', 'Consultar estado del alumno', undefined, token);
  await call('Estado académico', rol, 'GET', '/estado-academico/promedio/13?carreraId=3', 'Consultar promedio general', undefined, token);
}

for (const [rol, token] of [['ADMINISTRATIVO',admin.token],['PROFESOR',profesor.token]]) {
  await call('Libro de temas', rol, 'GET', '/libro-de-temas?page=1&limit=20', 'Listar libro de temas', undefined, token);
  await call('Libro de temas', rol, 'GET', '/libro-de-temas/materia/14', 'Listar temas de la materia', undefined, token);
}
const libro = await call('Libro de temas', 'PROFESOR', 'POST', '/libro-de-temas', 'Registrar tema de clase', {
  materiaId: 14, fecha: '2026-08-24', temaDesarrollado: 'Transformaciones lineales y aplicaciones geométricas', observaciones: 'Resolución colaborativa de problemas'
}, profesor.token);
const libroId = idOf(libro);
if (libroId) {
  await call('Libro de temas', 'PROFESOR', 'GET', `/libro-de-temas/${libroId}`, 'Consultar tema', undefined, profesor.token);
  await call('Libro de temas', 'PROFESOR', 'PUT', `/libro-de-temas/${libroId}`, 'Actualizar tema', { observaciones: 'Se incorporaron actividades de aplicación' }, profesor.token);
}
const libroAdmin = await call('Libro de temas', 'ADMINISTRATIVO', 'POST', '/libro-de-temas', 'Registrar tema de clase', {
  materiaId, fecha: '2026-08-25', temaDesarrollado: 'Diseño de proyectos culturales comunitarios',
  observaciones: 'Análisis de necesidades y definición de objetivos'
}, admin.token);
const libroAdminId = idOf(libroAdmin);
if (libroAdminId) {
  await call('Libro de temas', 'ADMINISTRATIVO', 'GET', `/libro-de-temas/${libroAdminId}`, 'Consultar tema', undefined, admin.token);
  await call('Libro de temas', 'ADMINISTRATIVO', 'PUT', `/libro-de-temas/${libroAdminId}`, 'Actualizar tema', {
    observaciones: 'Se agregó una matriz de actores institucionales'
  }, admin.token);
}

const homologacion = await call('Homologaciones', 'ADMINISTRATIVO', 'POST', '/homologaciones', 'Crear homologación total', {
  alumnoId: 13, materiaId, tipoHomologacion: 'TOTAL', calificacion: 8, observacion: 'Trayecto equivalente aprobado en institución de origen'
}, admin.token);
const homologacionId = idOf(homologacion);
await call('Homologaciones', 'ADMINISTRATIVO', 'GET', '/homologaciones?page=1&limit=20', 'Listar homologaciones', undefined, admin.token);
await call('Homologaciones', 'ALUMNO', 'GET', '/homologaciones/mis-solicitudes', 'Consultar solicitudes propias', undefined, alumno.token);
if (homologacionId) await call('Homologaciones', 'ADMINISTRATIVO', 'POST', `/homologaciones/${homologacionId}/resolver`, 'Aprobar homologación', { accion: 'APROBAR' }, admin.token);

const homologacionParcial = await call('Homologaciones', 'ADMINISTRATIVO', 'POST', '/homologaciones', 'Crear homologación parcial', {
  alumnoId: alumnoNuevoId, materiaId, tipoHomologacion: 'PARCIAL', calificacion: 7,
  observacion: 'Se reconoce el trayecto previo y se solicita una instancia complementaria'
}, admin.token);
const homologacionParcialId = idOf(homologacionParcial);
if (homologacionParcialId) {
  await call('Homologaciones', 'ADMINISTRATIVO', 'POST', `/homologaciones/${homologacionParcialId}/nota-complementaria`, 'Cargar nota complementaria', {
    notaExamenHomologacion: 8
  }, admin.token);
  await call('Homologaciones', 'ADMINISTRATIVO', 'POST', `/homologaciones/${homologacionParcialId}/resolver`, 'Aprobar homologación parcial', {
    accion: 'APROBAR'
  }, admin.token);
}

const examen = await call('Exámenes', 'ADMINISTRATIVO', 'POST', '/examenes', 'Crear mesa de examen', {
  materiaId, fecha: '2026-10-15T18:00:00.000Z', tipoExamen: 'ORAL', llamado: 1,
  folioExamen: `Folio ${stamp}`, libroExamen: 'Libro de actas 2026'
}, admin.token);
const examenId = idOf(examen);
let tribunalId;
let periodoExamenId;
if (examenId) {
  await call('Exámenes', 'ADMINISTRATIVO', 'PUT', `/examenes/${examenId}`, 'Actualizar mesa de examen', {
    tipoExamen: 'ESCRITO', estadoMesa: 'ABIERTA'
  }, admin.token);
  const tribunal = await call('Exámenes', 'ADMINISTRATIVO', 'POST', '/examenes/tribunales', 'Agregar integrante del tribunal', {
    mesaId: examenId, profesorId: 12, rolTribunal: 'PRESIDENTE'
  }, admin.token);
  tribunalId = idOf(tribunal);
  const periodoExamen = await call('Períodos', 'ADMINISTRATIVO', 'POST', '/periodos-inscripcion', 'Crear período de inscripción a exámenes', {
    tipo: 'EXAMEN', cicloLectivo: 2026,
    fechaInicio: '2026-08-01T00:00:00.000Z', fechaFin: '2026-10-10T23:59:59.000Z',
    mesasIds: [examenId], descripcion: 'Inscripción a mesas de octubre 2026'
  }, admin.token);
  periodoExamenId = idOf(periodoExamen);

  await call('Exámenes', 'ADMINISTRATIVO', 'POST', `/examenes/${examenId}/inscribir`, 'Inscribir alumna en la mesa', {
    alumnoId: 13, condicion: 'LIBRE'
  }, admin.token);
  await call('Exámenes', 'ADMINISTRATIVO', 'POST', `/examenes/${examenId}/desinscribir`, 'Desinscribir alumna de la mesa', {
    alumnoId: 13, condicion: 'LIBRE'
  }, admin.token);
  await call('Exámenes', 'ALUMNO', 'POST', `/examenes/${examenId}/inscribir`, 'Inscribirse en la mesa como libre', {
    condicion: 'LIBRE'
  }, alumnoNuevoSession.token);
  await call('Exámenes', 'ALUMNO', 'POST', `/examenes/${examenId}/desinscribir`, 'Desinscribirse de la mesa', {
    condicion: 'LIBRE'
  }, alumnoNuevoSession.token);
  await call('Exámenes', 'ADMINISTRATIVO', 'POST', `/examenes/${examenId}/inscribir`, 'Reinscribir alumna para calificar', {
    alumnoId: 13, condicion: 'LIBRE'
  }, admin.token);
  await call('Exámenes', 'PROFESOR', 'POST', `/examenes/${examenId}/calificacion`, 'Registrar nota de examen', {
    alumnoId: 13, nota: 8
  }, profesor.token);
  await call('Exámenes', 'ADMINISTRATIVO', 'POST', `/examenes/${examenId}/calificacion`, 'Rectificar nota de examen', {
    alumnoId: 13, nota: 9
  }, admin.token);
}

await call('Exámenes', 'ADMINISTRATIVO', 'GET', '/examenes?page=1&limit=20', 'Listar mesas', undefined, admin.token);
await call('Exámenes', 'PROFESOR', 'GET', '/examenes?page=1&limit=20', 'Listar mesas', undefined, profesor.token);
await call('Exámenes', 'ADMINISTRATIVO', 'GET', '/examenes/6', 'Consultar mesa', undefined, admin.token);
await call('Exámenes', 'ADMINISTRATIVO', 'GET', '/examenes/6/inscriptos', 'Listar inscriptos', undefined, admin.token);
for (const [rol, token] of [['ADMINISTRATIVO',admin.token],['ALUMNO',alumno.token]]) {
  await call('Exámenes', rol, 'GET', '/examenes/alumno/13/inscripciones', 'Consultar inscripciones a mesas', undefined, token);
}

const alumnoParaBaja = await call('Alumnos', 'ADMINISTRATIVO', 'POST', '/alumnos', 'Crear alumna para probar la baja', {
  apellidoNombre: 'María Josefina Peralta', dni: `46${stamp}`.slice(0, 8), rol: 'ALUMNO',
  email: `maria.peralta.${stamp}@instituto.edu.ar`, fechaNacimiento: '2004-11-06',
  telefono: '3424519038', password: alumnoBajaPassword, cuil: `27${`46${stamp}`.slice(0, 8)}2`,
  domicilio: 'Urquiza 2176, Santa Fe', anioEgreso: 2022,
  institucionProcedencia: 'Escuela de Educación Secundaria Orientada N.º 440'
}, admin.token);
const alumnoParaBajaId = requireId(alumnoParaBaja, 'la alumna destinada a la prueba de baja');

if (inscripcionMateriaAlumnoId) {
  await call('Inscripciones a materias', 'ALUMNO', 'DELETE', `/inscripciones-materias/${inscripcionMateriaAlumnoId}`, 'Dar de baja la inscripción propia', undefined, alumnoNuevoSession.token);
}
if (inscripcionMateriaAdminId) {
  await call('Inscripciones a materias', 'ADMINISTRATIVO', 'DELETE', `/inscripciones-materias/${inscripcionMateriaAdminId}`, 'Dar de baja una inscripción', undefined, admin.token);
}
const inscripcionCarreraAlumnoId = idOf(inscripcionCarreraAlumno);
const inscripcionCarreraAdminId = idOf(inscripcionCarreraAdmin);
if (inscripcionCarreraAlumnoId) {
  await call('Inscripciones a carreras', 'ALUMNO', 'DELETE', `/inscripciones-carreras/${inscripcionCarreraAlumnoId}`, 'Dar de baja la carrera propia', undefined, alumnoNuevoSession.token);
}
if (inscripcionCarreraAdminId) {
  await call('Inscripciones a carreras', 'ADMINISTRATIVO', 'DELETE', `/inscripciones-carreras/${inscripcionCarreraAdminId}`, 'Dar de baja una inscripción a carrera', undefined, admin.token);
}
if (libroAdminId) await call('Libro de temas', 'ADMINISTRATIVO', 'DELETE', `/libro-de-temas/${libroAdminId}`, 'Eliminar registro del libro de temas', undefined, admin.token);
if (horarioId) await call('Horarios', 'ADMINISTRATIVO', 'DELETE', `/horarios/${horarioId}`, 'Eliminar horario', undefined, admin.token);
if (periodoId) await call('Períodos', 'ADMINISTRATIVO', 'DELETE', `/periodos-inscripcion/${periodoId}`, 'Eliminar período de materias', undefined, admin.token);
if (periodoExamenId) await call('Períodos', 'ADMINISTRATIVO', 'DELETE', `/periodos-inscripcion/${periodoExamenId}`, 'Eliminar período de exámenes', undefined, admin.token);
if (tribunalId) await call('Exámenes', 'ADMINISTRATIVO', 'DELETE', `/examenes/tribunales/${tribunalId}`, 'Quitar integrante del tribunal', undefined, admin.token);
if (examenId) await call('Exámenes', 'ADMINISTRATIVO', 'DELETE', `/examenes/${examenId}`, 'Eliminar mesa de examen', undefined, admin.token);
await call('Materias', 'ADMINISTRATIVO', 'DELETE', `/materias/${materiaId}/profesores/12`, 'Desasignar profesor de la materia', undefined, admin.token);
await call('Cursadas', 'ADMINISTRATIVO', 'DELETE', `/cursadas/${cursadaId}`, 'Dar de baja la cursada', undefined, admin.token);
await call('Materias', 'ADMINISTRATIVO', 'DELETE', `/materias/${materiaId}`, 'Dar de baja la materia', undefined, admin.token);
await call('Carreras', 'ADMINISTRATIVO', 'DELETE', `/carreras/${carreraId}`, 'Dar de baja la carrera', undefined, admin.token);
await call('Alumnos', 'ADMINISTRATIVO', 'DELETE', `/alumnos/${alumnoParaBajaId}`, 'Dar de baja alumna', undefined, admin.token);
await call('Profesores', 'ADMINISTRATIVO', 'DELETE', `/profesores/${profesorNuevoId}`, 'Dar de baja profesor', undefined, admin.token);
await call('Administrativos', 'ADMINISTRATIVO', 'DELETE', `/administrativos/${adminNuevoId}`, 'Dar de baja administrativa', undefined, admin.token);
await call('Usuarios', 'ADMINISTRATIVO', 'DELETE', `/users/${registradoId}`, 'Dar de baja usuario', undefined, admin.token);

if (admin.refreshToken) {
  await call('Auth', 'ADMINISTRATIVO', 'POST', '/auth/refresh-token', 'Renovar sesión', { refreshToken: admin.refreshToken });
}
results.push({ modulo: 'Auth', rol: 'PUBLICO', metodo: 'POST', endpoint: '/auth/forgot-password', descripcion: '[PUBLICO] Pendiente: requiere configuración de correo', body: null, codigo: 'PENDIENTE' });
results.push({ modulo: 'Auth', rol: 'PUBLICO', metodo: 'GET', endpoint: '/auth/verify-reset-token/{token}', descripcion: '[PUBLICO] Pendiente: requiere token recibido por correo', body: null, codigo: 'PENDIENTE' });
results.push({ modulo: 'Auth', rol: 'PUBLICO', metodo: 'POST', endpoint: '/auth/reset-password', descripcion: '[PUBLICO] Pendiente: requiere token recibido por correo', body: null, codigo: 'PENDIENTE' });

await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
await writeFile(new URL('../test-results/endpoints-happy-path.json', import.meta.url), JSON.stringify(results, null, 2));
await prisma.$disconnect();
const failures = results.filter(row => typeof row.codigo === 'number' && row.codigo >= 400);
process.stdout.write(JSON.stringify({ total: results.length, failures: failures.length, failureRows: failures }, null, 2));
