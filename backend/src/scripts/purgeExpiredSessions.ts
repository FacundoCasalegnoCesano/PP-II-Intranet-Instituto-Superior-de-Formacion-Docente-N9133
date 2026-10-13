import { pathToFileURL } from 'node:url';
import { prisma } from '../config/prisma.js';

const BATCH_SIZE = 500;

export function parseApplyMode(args: string[]): boolean {
  if (args.some((arg) => arg !== '--apply' && arg !== '--dry-run') || args.length > 1) {
    throw new Error('Usage: sessions:purge [--dry-run|--apply]');
  }
  return args.includes('--apply');
}

export function expiredSessionWhere(cutoff: Date, ids?: number[]) {
  return {
    expiraEn: { lte: cutoff },
    OR: [{ refreshTokenExpira: null }, { refreshTokenExpira: { lte: cutoff } }],
    ...(ids ? { id: { in: ids } } : {})
  };
}

export async function purgeExpiredSessions(apply: boolean, cutoff = new Date()): Promise<void> {
  let cursor = 0;
  let candidates = 0;
  let deleted = 0;
  while (true) {
    const rows = await prisma.sesion.findMany({
      where: { ...expiredSessionWhere(cutoff), id: { gt: cursor } },
      orderBy: { id: 'asc' }, take: BATCH_SIZE, select: { id: true }
    });
    if (!rows.length) break;
    const ids = rows.map(({ id }) => id);
    cursor = ids[ids.length - 1]!;
    candidates += ids.length;
    if (apply) {
      const result = await prisma.sesion.deleteMany({ where: expiredSessionWhere(cutoff, ids) });
      deleted += result.count;
    }
  }
  console.info(`[sessions:purge] mode=${apply ? 'apply' : 'dry-run'} candidates=${candidates} deleted=${deleted}`);
}

async function main(): Promise<void> {
  try {
    await purgeExpiredSessions(parseApplyMode(process.argv.slice(2)));
  } catch (error) {
    const failure = error as { name?: string; code?: string; message?: string };
    if (failure?.message?.startsWith('Usage:')) {
      console.error(failure.message);
      process.exitCode = 2;
    } else {
      console.error(`[sessions:purge] failed name=${failure?.name ?? 'Error'} code=${failure?.code ?? 'unknown'}`);
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
