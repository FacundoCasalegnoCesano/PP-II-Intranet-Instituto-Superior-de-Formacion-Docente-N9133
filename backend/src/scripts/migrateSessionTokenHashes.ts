import { pathToFileURL } from 'node:url';
import { prisma } from '../config/prisma.js';
import { hashSessionToken } from '../utils/jwt.js';

const BATCH_SIZE = 500;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

type SessionToken = { id: number; token: string };

export function parseApplyMode(args: string[]): boolean {
  if (args.some((arg) => arg !== '--apply' && arg !== '--dry-run') || args.length > 1) {
    throw new Error('Usage: sessions:migrate-hashes [--dry-run|--apply]');
  }
  return args.includes('--apply');
}

export async function migrateSessionTokenHashes(apply: boolean): Promise<void> {
  let cursor = 0;
  let legacyCount = 0;
  let hashedCount = 0;
  let unknownCount = 0;
  const unknownIds: number[] = [];

  // Preflight the full table so malformed values cannot cause partial conversion.
  while (true) {
    const rows: SessionToken[] = await prisma.sesion.findMany({
      where: { id: { gt: cursor } }, orderBy: { id: 'asc' }, take: BATCH_SIZE,
      select: { id: true, token: true }
    });
    if (!rows.length) break;
    cursor = rows[rows.length - 1]!.id;
    for (const row of rows) {
      if (HASH_PATTERN.test(row.token)) { hashedCount++; continue; }
      if (JWT_PATTERN.test(row.token)) legacyCount++;
      else { unknownCount++; if (unknownIds.length < 20) unknownIds.push(row.id); }
    }
  }

  console.info(`[sessions:migrate-hashes] mode=${apply ? 'apply' : 'dry-run'} legacy=${legacyCount} alreadyHashed=${hashedCount} unknown=${unknownCount}`);
  if (unknownCount) {
    console.error(`[sessions:migrate-hashes] aborted: unknown=${unknownCount} ids=${unknownIds.join(',')}`);
    process.exitCode = 1;
    return;
  }
  if (!apply) return;

  cursor = 0;
  let converted = 0;
  while (true) {
    const rows: SessionToken[] = await prisma.sesion.findMany({
      where: { id: { gt: cursor } },
      orderBy: { id: 'asc' }, take: BATCH_SIZE, select: { id: true, token: true }
    });
    if (!rows.length) break;
    cursor = rows[rows.length - 1]!.id;
    await prisma.$transaction(async (tx) => {
      for (const row of rows) {
        if (HASH_PATTERN.test(row.token)) continue;
        if (!JWT_PATTERN.test(row.token)) throw new Error(`Unexpected session token format at session id ${row.id}`);
        const result = await tx.sesion.updateMany({
          where: { id: row.id, token: row.token },
          data: { token: hashSessionToken(row.token) }
        });
        converted += result.count;
      }
    });
  }
  console.info(`[sessions:migrate-hashes] complete converted=${converted}`);
}

async function main(): Promise<void> {
  try {
    await migrateSessionTokenHashes(parseApplyMode(process.argv.slice(2)));
  } catch (error) {
    const failure = error as { name?: string; code?: string; message?: string };
    if (failure?.message?.startsWith('Usage:')) {
      console.error(failure.message);
      process.exitCode = 2;
    } else {
      const safeDetail = failure?.message?.match(/^Unexpected session token format at session id \d+$/)?.[0];
      console.error(`[sessions:migrate-hashes] failed name=${failure?.name ?? 'Error'} code=${failure?.code ?? 'unknown'}${safeDetail ? ` detail=${safeDetail}` : ''}`);
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
