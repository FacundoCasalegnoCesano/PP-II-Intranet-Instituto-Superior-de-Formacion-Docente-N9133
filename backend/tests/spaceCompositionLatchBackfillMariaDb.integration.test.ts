import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.SPACE_LATCH_TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
const integrationEnabled = process.env.SPACE_LATCH_MARIADB_TEST === '1' && (() => {
  try {
    const parsed = new URL(databaseUrl);
    return parsed.protocol === 'mysql:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname) &&
      parsed.pathname === '/isfd_recovery_20261020';
  } catch {
    return false;
  }
})();

test('backfill MariaDB bloquea espacios que completan sus componentes por PROMOCIONADO', { skip: !integrationEnabled }, async () => {
  const [{ backfillSpaceCompositionLatches }] = await Promise.all([
    import('../src/scripts/backfillSpaceCompositionLatches.js')
  ]);
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = randomBytes(6).toString('hex');
  let usuarioId: number | undefined;
  let alumnoId: number | undefined;
  let carreraId: number | undefined;
  let espacioId: number | undefined;
  const materiaIds: number[] = [];
  const cursadaIds: number[] = [];
  const savedInfo = console.info;
  console.info = () => undefined;

  try {
    const usuario = await client.usuario.create({ data: {
      apellidoNombre: 'Fixture Backfill Promoción',
      dni: 30_000_000 + Number.parseInt(suffix.slice(0, 6), 16) % 90_000_000,
      email: `space-latch-${suffix}@example.test`,
      fechaNacimiento: new Date('2000-01-01'),
      telefono: '0000000000',
      passwordHash: 'not-used-in-this-fixture',
      rol: 'ALUMNO'
    } });
    usuarioId = usuario.idUsuario;
    const alumno = await client.alumno.create({ data: {
      idCuenta: usuario.idUsuario,
      domicilio: 'Fixture backfill'
    } });
    alumnoId = alumno.idAlumno;
    const carrera = await client.carrera.create({ data: { nombre: `Fixture latch ${suffix}`, duracionAnios: 2 } });
    carreraId = carrera.id;
    const espacio = await client.espacioCurricular.create({ data: {
      nombre: `Espacio promoción ${suffix}`,
      carreraId: carrera.id,
      activo: true
    } });
    espacioId = espacio.id;

    for (const label of ['A', 'B']) {
      const materia = await client.materia.create({ data: {
        nombre: `Componente ${label} ${suffix}`,
        cargaHoraria: 64,
        carreraId: carrera.id,
        espacioCurricularId: espacio.id,
        notaMinima: 6,
        notaPromocion: 8,
        asistenciaRequerida: 75,
        tpRequeridos: 100,
        esPromocionable: true
      } });
      materiaIds.push(materia.id);
      const cursada = await client.cursada.create({ data: {
        materiaId: materia.id,
        anioLectivo: 2025,
        activo: true
      } });
      cursadaIds.push(cursada.id);
      await client.inscripcionMateria.create({ data: {
        alumnoId: alumno.idAlumno,
        materiaId: materia.id,
        cicloLectivo: 2025,
        cursadaId: cursada.id
      } });
      await client.calificacion.createMany({ data: [
        { cursadaId: cursada.id, alumnoId: alumno.idAlumno, tipoCalificacion: 'PARCIAL', numero: 1, nota: 9 },
        { cursadaId: cursada.id, alumnoId: alumno.idAlumno, tipoCalificacion: 'TRABAJO_PRACTICO', numero: 1, nota: 10 },
        { cursadaId: cursada.id, alumnoId: alumno.idAlumno, tipoCalificacion: 'EXAMEN_FINAL', numero: 1, nota: 9 }
      ] });
      await client.asistencia.create({ data: {
        cursadaId: cursada.id,
        alumnoId: alumno.idAlumno,
        fecha: new Date(`2025-04-0${label === 'A' ? 1 : 2}T12:00:00.000Z`),
        presente: true
      } });
    }

    const before = await client.espacioCurricular.findUniqueOrThrow({ where: { id: espacio.id } });
    assert.equal(before.composicionBloqueadaAt, null);
    assert.equal(await backfillSpaceCompositionLatches(false, client), 1);
    assert.equal((await client.espacioCurricular.findUniqueOrThrow({ where: { id: espacio.id } })).composicionBloqueadaAt, null);
    assert.equal(await backfillSpaceCompositionLatches(true, client), 1);
    const latchedAt = (await client.espacioCurricular.findUniqueOrThrow({ where: { id: espacio.id } })).composicionBloqueadaAt;
    assert.ok(latchedAt instanceof Date);
    assert.equal(await backfillSpaceCompositionLatches(true, client), 0);
    assert.equal((await client.espacioCurricular.findUniqueOrThrow({ where: { id: espacio.id } })).composicionBloqueadaAt?.getTime(), latchedAt.getTime());
  } finally {
    console.info = savedInfo;
    if (cursadaIds.length) {
      await client.calificacion.deleteMany({ where: { cursadaId: { in: cursadaIds } } });
      await client.asistencia.deleteMany({ where: { cursadaId: { in: cursadaIds } } });
    }
    if (alumnoId && materiaIds.length) await client.inscripcionMateria.deleteMany({ where: { alumnoId, materiaId: { in: materiaIds } } });
    if (cursadaIds.length) await client.cursada.deleteMany({ where: { id: { in: cursadaIds } } });
    if (materiaIds.length) await client.materia.deleteMany({ where: { id: { in: materiaIds } } });
    if (espacioId) await client.espacioCurricular.deleteMany({ where: { id: espacioId } });
    if (carreraId) await client.carrera.deleteMany({ where: { id: carreraId } });
    if (alumnoId) await client.alumno.deleteMany({ where: { idAlumno: alumnoId } });
    if (usuarioId) await client.usuario.deleteMany({ where: { idUsuario: usuarioId } });
    await client.$disconnect();
  }
});
