import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import jsonwebtoken from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const disposableUrl = process.env.DATABASE_URL ?? '';
const integrationEnabled = process.env.SESSIONS_MARIADB_TEST === '1'
  && /^mysql:\/\/[^@]+@127\.0\.0\.1:33317\/codex_sessions_test(?:\?|$)/.test(disposableUrl);

test('auth token hashes, migration and expiry purge against disposable MariaDB', { skip: !integrationEnabled }, async () => {
  const [{ prisma }, { default: authService }, { hashPassword }, jwt, auth, purge] = await Promise.all([
    import('../src/config/prisma.js'),
    import('../src/services/authService.js'),
    import('../src/utils/bcrypt.js'),
    import('../src/utils/jwt.js'),
    import('../src/middleware/auth.js'),
    import('../src/scripts/purgeExpiredSessions.js')
  ]);
  const secondaryPrisma = new PrismaClient();
  const identity = randomBytes(4).readUInt32BE(0) % 100_000_000;
  const email = `sessions-${randomBytes(6).toString('hex')}@example.test`;
  let userId: number | undefined;
  const savedError = console.error;
  const savedInfo = console.info;
  console.error = () => undefined;
  console.info = () => undefined;

  async function authenticate(token: string) {
    let status = 0;
    let payload: any;
    let continued = false;
    const req: any = { headers: { authorization: `Bearer ${token}` } };
    const res: any = {
      status: (code: number) => { status = code; return res; },
      json: (body: unknown) => { payload = body; return res; }
    };
    await auth.authOnly(req, res, () => { continued = true; });
    return { status, payload, continued, req };
  }

  try {
    const user = await prisma.usuario.create({ data: {
      apellidoNombre: 'Fixture Sesiones', dni: 41_000_000 + identity % 900_000,
      email, fechaNacimiento: new Date('2000-01-01'), telefono: '0000000000',
      passwordHash: await hashPassword('fixture-password-2026'), rol: 'ALUMNO,PROFESOR'
    } });
    userId = user.idUsuario;

    const login = await authService.login(email, 'fixture-password-2026', undefined, 'sessions-test');
    let session = await prisma.sesion.findUniqueOrThrow({ where: { id: login.sessionId } });
    assert.equal(session.token, jwt.hashSessionToken(login.accessToken));
    assert.equal((await authenticate(login.accessToken)).continued, true);
    assert.equal((await authenticate(session.token)).status, 401);
    assert.equal((await authenticate('incorrect-token')).status, 401);
    const expiredToken = jsonwebtoken.sign({
      id: user.idUsuario, email, dni: String(user.dni), nombre: user.apellidoNombre, type: 'access'
    }, process.env.JWT_SECRET!, { expiresIn: -1 });
    assert.equal((await authenticate(expiredToken)).status, 401);

    const selected = await authService.selectRole(user.idUsuario, 'ALUMNO', login.sessionId);
    session = await prisma.sesion.findUniqueOrThrow({ where: { id: selected.sessionId } });
    assert.equal(session.token, jwt.hashSessionToken(selected.accessToken));
    assert.equal(session.refreshTokenHash, jwt.hashSessionToken(selected.refreshToken));
    assert.equal((await authenticate(selected.accessToken)).continued, true);

    const rotated = await authService.refreshToken(selected.refreshToken);
    const rotatedHash = jwt.hashSessionToken(rotated.accessToken);
    const rotatedSession = await prisma.sesion.findUniqueOrThrow({ where: { token: rotatedHash } });
    assert.equal(rotatedSession.refreshTokenHash, jwt.hashSessionToken(rotated.refreshToken));
    assert.equal((await authenticate(rotated.accessToken)).continued, true);
    assert.equal((await authenticate(selected.accessToken)).status, 401);
    await assert.rejects(authService.refreshToken(selected.refreshToken), /Refresh token inválido o expirado/);
    assert.equal((await prisma.sesion.findUniqueOrThrow({ where: { id: rotatedSession.id } })).revocadaEn instanceof Date, true);

    const legacy = jwt.generateAccessToken({ id: user.idUsuario, email, dni: String(user.dni), nombre: user.apellidoNombre });
    const legacyRow = await prisma.sesion.create({ data: {
      token: legacy, usuarioId: user.idUsuario, expiraEn: new Date(Date.now() + 60_000)
    } });
    const unknownValue = `private-unknown-${randomBytes(8).toString('hex')}`;
    const unknownRow = await prisma.sesion.create({ data: {
      token: unknownValue, usuarioId: user.idUsuario, expiraEn: new Date(Date.now() + 60_000)
    } });
    const migrateCli = fileURLToPath(new URL('../dist/scripts/migrateSessionTokenHashes.js', import.meta.url));
    const runCli = (script: string, ...args: string[]) => spawnSync(process.execPath, [script, ...args], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: disposableUrl, JWT_SECRET: 'disposable-session-test-secret-for-local-only', NODE_ENV: 'production' }
    });
    const migrationDryRun = runCli(migrateCli);
    assert.equal(migrationDryRun.status, 1);
    assert.match(migrationDryRun.stdout, /mode=dry-run legacy=1 .*unknown=1/);
    assert.doesNotMatch(`${migrationDryRun.stdout}${migrationDryRun.stderr}`, new RegExp(unknownValue));
    const explicitMigrationDryRun = runCli(migrateCli, '--dry-run');
    assert.equal(explicitMigrationDryRun.status, 1);
    assert.equal((await prisma.sesion.findUniqueOrThrow({ where: { id: legacyRow.id } })).token, legacy);
    const migrationWithUnknown = runCli(migrateCli, '--apply');
    assert.equal(migrationWithUnknown.status, 1);
    assert.match(migrationWithUnknown.stderr, new RegExp(`ids=.*${unknownRow.id}`));
    assert.doesNotMatch(`${migrationWithUnknown.stdout}${migrationWithUnknown.stderr}`, new RegExp(unknownValue));
    assert.equal((await prisma.sesion.findUniqueOrThrow({ where: { id: legacyRow.id } })).token, legacy);
    await prisma.sesion.delete({ where: { id: unknownRow.id } });
    const cleanMigrationDryRun = runCli(migrateCli);
    assert.equal(cleanMigrationDryRun.status, 0, cleanMigrationDryRun.stderr);
    assert.match(cleanMigrationDryRun.stdout, /mode=dry-run legacy=1 .*unknown=0/);
    const cleanExplicitDryRun = runCli(migrateCli, '--dry-run');
    assert.equal(cleanExplicitDryRun.status, 0, cleanExplicitDryRun.stderr);
    const migrationApply = runCli(migrateCli, '--apply');
    assert.equal(migrationApply.status, 0, migrationApply.stderr);
    const migratedDigest = jwt.hashSessionToken(legacy);
    assert.equal((await prisma.sesion.findUniqueOrThrow({ where: { id: legacyRow.id } })).token, migratedDigest);
    const migrationRepeat = runCli(migrateCli, '--apply');
    assert.equal(migrationRepeat.status, 0, migrationRepeat.stderr);
    assert.match(migrationRepeat.stdout, /complete converted=0/);
    assert.equal((await prisma.sesion.findUniqueOrThrow({ where: { id: legacyRow.id } })).token, migratedDigest);

    const cutoff = new Date(Date.now() - 10_000);
    const expiryRows = [
      { name: 'legacy-null-refresh', expiraEn: cutoff, refreshTokenExpira: null, revocadaEn: null, expected: false },
      { name: 'fully-expired', expiraEn: cutoff, refreshTokenExpira: cutoff, revocadaEn: null, expected: false },
      { name: 'revoked-refresh-valid', expiraEn: cutoff, refreshTokenExpira: new Date(cutoff.getTime() + 60_000), revocadaEn: cutoff, expected: true },
      { name: 'access-future', expiraEn: new Date(cutoff.getTime() + 60_000), refreshTokenExpira: cutoff, revocadaEn: null, expected: true }
    ];
    const expirySessionIds: number[] = [];
    for (const row of expiryRows) {
      const created = await prisma.sesion.create({ data: {
        token: randomBytes(32).toString('hex'), usuarioId: user.idUsuario,
        expiraEn: row.expiraEn, refreshTokenExpira: row.refreshTokenExpira,
        revocadaEn: row.revocadaEn
      } });
      expirySessionIds.push(created.id);
    }
    const batchTokens = Array.from({ length: 502 }, () => randomBytes(32).toString('hex'));
    await prisma.sesion.createMany({ data: batchTokens.map((token) => ({
      token, usuarioId: user.idUsuario, expiraEn: cutoff, refreshTokenExpira: null
    })) });
    await purge.purgeExpiredSessions(false, cutoff);
    assert.equal(await prisma.sesion.count({ where: { id: { in: expirySessionIds } } }), expiryRows.length);
    assert.equal(await prisma.sesion.count({ where: { token: { in: batchTokens } } }), batchTokens.length);
    await purge.purgeExpiredSessions(true, cutoff);
    const remaining = await prisma.sesion.findMany({ where: { id: { in: expirySessionIds } }, select: { id: true } });
    const remainingIds = new Set(remaining.map(({ id }) => id));
    expiryRows.forEach((row, index) => assert.equal(remainingIds.has(expirySessionIds[index]!), row.expected, row.name));
    assert.equal(await prisma.sesion.count({ where: { token: { in: batchTokens } } }), 0);

    const raceCutoff = new Date(Date.now() + 30_000);
    const rotationRefresh = jwt.generateRefreshToken({
      id: user.idUsuario, email, dni: String(user.dni), nombre: user.apellidoNombre, rol: 'ALUMNO'
    });
    const rotationSession = await prisma.sesion.create({ data: {
      token: jwt.hashSessionToken(jwt.generateAccessToken({ id: user.idUsuario, email, dni: String(user.dni), nombre: user.apellidoNombre, rol: 'ALUMNO' })),
      refreshTokenHash: jwt.hashSessionToken(rotationRefresh),
      refreshTokenExpira: new Date(raceCutoff.getTime() - 1_000),
      usuarioId: user.idUsuario, expiraEn: new Date(raceCutoff.getTime() - 1_000)
    } });
    const replayRefresh = jwt.generateRefreshToken({
      id: user.idUsuario, email, dni: String(user.dni), nombre: user.apellidoNombre, rol: 'ALUMNO'
    });
    const replaySession = await prisma.sesion.create({ data: {
      token: jwt.hashSessionToken(jwt.generateAccessToken({ id: user.idUsuario, email, dni: String(user.dni), nombre: user.apellidoNombre, rol: 'ALUMNO' })),
      refreshTokenHash: jwt.hashSessionToken(replayRefresh),
      refreshTokenExpira: new Date(raceCutoff.getTime() + 60_000),
      revocadaEn: new Date(),
      usuarioId: user.idUsuario, expiraEn: new Date(raceCutoff.getTime() - 1_000)
    } });
    const raceCandidate = await prisma.sesion.create({ data: {
      token: randomBytes(32).toString('hex'), usuarioId: user.idUsuario,
      expiraEn: new Date(raceCutoff.getTime() - 1_000), refreshTokenExpira: new Date(raceCutoff.getTime() - 1_000)
    } });
    const originalFindMany = prisma.sesion.findMany;
    const callOriginalFindMany = originalFindMany.bind(prisma.sesion);
    let raceBarrierReached = false;
    (prisma.sesion as any).findMany = async (args: any) => {
      const rows = await callOriginalFindMany(args);
      if (!raceBarrierReached && rows.some(({ id }: { id: number }) => id === raceCandidate.id)) {
        raceBarrierReached = true;
        await secondaryPrisma.sesion.update({
          where: { id: rotationSession.id }, data: { refreshTokenExpira: new Date(raceCutoff.getTime() + 60_000) }
        });
        const rotated = await authService.refreshToken(rotationRefresh);
        assert.ok(await prisma.sesion.findUnique({ where: { token: jwt.hashSessionToken(rotated.accessToken) } }));
        await assert.rejects(authService.refreshToken(replayRefresh), /Refresh token inválido o expirado/);
      }
      return rows;
    };
    try {
      await purge.purgeExpiredSessions(true, raceCutoff);
    } finally {
      (prisma.sesion as any).findMany = originalFindMany;
    }
    assert.equal(raceBarrierReached, true);
    assert.equal(await prisma.sesion.findUnique({ where: { id: raceCandidate.id } }), null);
    const rotatedOriginal = await prisma.sesion.findUniqueOrThrow({ where: { id: rotationSession.id } });
    assert.ok(rotatedOriginal.revocadaEn instanceof Date);
    assert.ok(rotatedOriginal.refreshTokenExpira! > raceCutoff);
    const replayPreserved = await prisma.sesion.findUniqueOrThrow({ where: { id: replaySession.id } });
    assert.ok(replayPreserved.revocadaEn instanceof Date);
    assert.ok(replayPreserved.refreshTokenExpira! > raceCutoff);

    const purgeCli = fileURLToPath(new URL('../dist/scripts/purgeExpiredSessions.js', import.meta.url));
    const purgeCandidate = await prisma.sesion.create({ data: {
      token: randomBytes(32).toString('hex'), usuarioId: user.idUsuario,
      expiraEn: new Date(Date.now() - 60_000), refreshTokenExpira: null
    } });
    const protectedSession = await prisma.sesion.create({ data: {
      token: randomBytes(32).toString('hex'), usuarioId: user.idUsuario,
      expiraEn: new Date(Date.now() - 60_000), refreshTokenExpira: new Date(Date.now() + 60_000), revocadaEn: new Date()
    } });
    for (const args of [[], ['--dry-run']]) {
      const result = runCli(purgeCli, ...args);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /mode=dry-run candidates=1 deleted=0/);
      assert.ok(await prisma.sesion.findUnique({ where: { id: purgeCandidate.id } }));
      assert.ok(await prisma.sesion.findUnique({ where: { id: protectedSession.id } }));
    }
    const purgeApply = runCli(purgeCli, '--apply');
    assert.equal(purgeApply.status, 0, purgeApply.stderr);
    assert.match(purgeApply.stdout, /mode=apply candidates=1 deleted=1/);
    assert.equal(await prisma.sesion.findUnique({ where: { id: purgeCandidate.id } }), null);
    assert.ok(await prisma.sesion.findUnique({ where: { id: protectedSession.id } }));
    const purgeRepeat = runCli(purgeCli, '--apply');
    assert.equal(purgeRepeat.status, 0, purgeRepeat.stderr);
    assert.match(purgeRepeat.stdout, /mode=apply candidates=0 deleted=0/);
  } finally {
    console.error = savedError;
    console.info = savedInfo;
    if (userId !== undefined) {
      await prisma.sesion.deleteMany({ where: { usuarioId: userId } });
      await prisma.usuario.delete({ where: { idUsuario: userId } });
    }
    await secondaryPrisma.$disconnect();
    await prisma.$disconnect();
  }
});
