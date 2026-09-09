import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { HorarioPublicadoService, validarArchivoHorario } from '../src/services/horarioPublicadoService.js';
import { ROLES } from '../src/constants/roles.js';
import { publicarHorarioSchema } from '../src/validations/horarioPublicadoValidation.js';

const administrador = { id: 7, rol: ROLES.ADMINISTRATIVO };
const alumno = { id: 8, rol: ROLES.ALUMNO };
const pdf = (nombre = 'horario.pdf') => ({
  originalname: nombre,
  mimetype: 'application/pdf',
  buffer: Buffer.from('%PDF-1.7\ncontenido institucional'),
  size: Buffer.byteLength('%PDF-1.7\ncontenido institucional')
});

function documento(overrides: Record<string, unknown> = {}) {
  return {
    id: 31,
    cicloLectivo: 2026,
    titulo: 'Horarios 2026',
    nombreOriginal: 'horario.pdf',
    claveInterna: '11111111-1111-4111-8111-111111111111',
    tamanio: 30,
    sha256: 'a'.repeat(64),
    publicadorId: 7,
    createdAt: new Date('2026-08-31T12:00:00.000Z'),
    publicacionVigente: { cicloLectivo: 2026 },
    publicador: { idUsuario: 7, apellidoNombre: 'Admin Instituto' },
    ...overrides
  };
}

function dependencias(overrides: Record<string, unknown> = {}) {
  const calls: Record<string, any[]> = { writes: [], unlinks: [], publica: [], creados: [] };
  const repo: any = {
    listarAnios: async () => [{ cicloLectivo: 2026 }],
    buscarVigentePorCiclo: async () => null,
    buscarUltimaVigente: async () => null,
    buscarPorId: async () => null,
    buscarPorCicloYHash: async () => null,
    listarHistorial: async () => [],
    // La transacción de Prisma devuelve el documento creado sin relaciones incluidas.
    crearYPublicar: async (data: any) => {
      calls.creados.push(data);
      return documento({ ...data, publicacionVigente: null, publicador: undefined });
    },
    publicarExistente: async (doc: any) => { calls.publica.push(doc); },
    ...overrides
  };
  const storage: any = {
    access: async () => undefined,
    mkdir: async () => undefined,
    writeFile: async (...args: any[]) => { calls.writes.push(args); },
    unlink: async (ruta: string) => { calls.unlinks.push(ruta); }
  };
  return { calls, repo, storage };
}

test('publicación inicial escribe un PDF con clave aleatoria y lo deja vigente', async () => {
  const { repo, storage, calls } = dependencias();
  const service = new HorarioPublicadoService(repo, storage, 'C:/private/horarios');

  const resultado = await service.publicarArchivo({ cicloLectivo: 2026, titulo: 'Horarios oficiales' }, pdf(), administrador);

  assert.equal(resultado.reutilizado, false);
  assert.equal(resultado.documento.vigente, true);
  assert.equal(calls.writes.length, 1);
  assert.equal(calls.unlinks.length, 0);
  assert.match(calls.writes[0]![0], /[0-9a-f-]{36}\.pdf$/);
  assert.equal(calls.writes[0]![1].toString('ascii', 0, 5), '%PDF-');
  assert.equal(calls.creados[0]!.sha256, crypto.createHash('sha256').update(pdf().buffer).digest('hex'));
  assert.match(calls.creados[0]!.claveInterna, /^[0-9a-f-]{36}$/);
});

test('un reintento idéntico restaura el documento sin escribir otra versión', async () => {
  const previo = documento({ publicacionVigente: null });
  const { repo, storage, calls } = dependencias({ buscarPorCicloYHash: async () => previo });
  const service = new HorarioPublicadoService(repo, storage, 'C:/private/horarios');

  const resultado = await service.publicarArchivo({ cicloLectivo: 2026 }, pdf(), administrador);

  assert.equal(resultado.reutilizado, true);
  assert.equal(resultado.documento.vigente, true);
  assert.equal(calls.writes.length, 0);
  assert.deepEqual(calls.publica, [previo]);
});

test('una carrera de publicación reutiliza la versión ganadora y limpia el archivo perdedor', async () => {
  const ganador = documento({ publicacionVigente: null });
  let busquedas = 0;
  const { repo, storage, calls } = dependencias({
    buscarPorCicloYHash: async () => (++busquedas === 1 ? null : ganador),
    crearYPublicar: async () => { throw Object.assign(new Error('duplicado'), { code: 'P2002' }); }
  });
  const service = new HorarioPublicadoService(repo, storage, 'C:/private/horarios');

  const resultado = await service.publicarArchivo({ cicloLectivo: 2026 }, pdf(), administrador);

  assert.equal(resultado.reutilizado, true);
  assert.equal(calls.writes.length, 1);
  assert.equal(calls.unlinks.length, 1);
  assert.deepEqual(calls.publica, [ganador]);
});

test('rechaza archivos vacíos, con MIME, firma o extensión inseguros', () => {
  assert.throws(() => validarArchivoHorario({ ...pdf(), size: 0, buffer: Buffer.alloc(0) }), /vacío/);
  assert.throws(() => validarArchivoHorario({ ...pdf(), mimetype: 'text/plain' }), /MIME/);
  assert.throws(() => validarArchivoHorario({ ...pdf(), originalname: 'horario.pdf.exe' }), /extensión simple/);
  assert.throws(() => validarArchivoHorario({ ...pdf(), buffer: Buffer.from('texto') }), /firma PDF/);
  assert.throws(() => validarArchivoHorario({ ...pdf(), size: 10 * 1024 * 1024 + 1 }), /límite de 10 MB/);
});

test('limita el título de publicación a 160 caracteres', () => {
  const validacion = publicarHorarioSchema.validate({ cicloLectivo: 2026, titulo: 'x'.repeat(161) });
  assert.ok(validacion.error);
  assert.match(validacion.error.message, /160/);
});

test('limpia el archivo nuevo si la transacción falla sin reemplazar la publicación anterior', async () => {
  const { repo, storage, calls } = dependencias({ crearYPublicar: async () => { throw new Error('DB caída'); } });
  const service = new HorarioPublicadoService(repo, storage, 'C:/private/horarios');

  await assert.rejects(service.publicarArchivo({ cicloLectivo: 2026 }, pdf(), administrador), /DB caída/);
  assert.equal(calls.writes.length, 1);
  assert.equal(calls.unlinks.length, 1);
});

test('permite descargar el vigente a todos y reserva históricos al administrativo', async () => {
  const historico = documento({ publicacionVigente: null });
  const { repo, storage } = dependencias({ buscarPorId: async () => historico });
  const service = new HorarioPublicadoService(repo, storage, 'C:/private/horarios');

  await assert.rejects(service.obtenerArchivo(31, alumno), (error: any) => error.statusCode === 403);
  const archivo = await service.obtenerArchivo(31, administrador);
  assert.equal(archivo.documento.id, 31);
});

test('sin ciclo pedido busca primero el año actual y luego el último publicado', async () => {
  const ultimo = documento({ cicloLectivo: 2025 });
  const { repo, storage } = dependencias({
    buscarVigentePorCiclo: async () => null,
    buscarUltimaVigente: async () => ({ documento: ultimo })
  });
  const service = new HorarioPublicadoService(repo, storage, 'C:/private/horarios');

  const actual = await service.obtenerActual();
  assert.equal(actual.cicloLectivo, 2025);
});

test('solo un administrativo puede restaurar una versión histórica', async () => {
  const previo = documento({ publicacionVigente: null });
  const { repo, storage, calls } = dependencias({ buscarPorId: async () => previo });
  const service = new HorarioPublicadoService(repo, storage, 'C:/private/horarios');

  await assert.rejects(service.restaurar(31, alumno), (error: any) => error.statusCode === 403);
  const restaurado = await service.restaurar(31, administrador);
  assert.equal(restaurado.id, 31);
  assert.equal(restaurado.vigente, true);
  assert.deepEqual(calls.publica, [previo]);
});
