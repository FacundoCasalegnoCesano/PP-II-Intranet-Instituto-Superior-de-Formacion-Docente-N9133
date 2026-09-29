import { prisma } from '../config/prisma.js';
import { Prisma } from '@prisma/client';

export interface PasswordResetTokenCreateData {
  usuarioId: number;
  tokenHash: string;
  expiresAt: Date;
}

export interface ConsumePasswordResetData {
  tokenHash: string;
  newPasswordHash: string;
  now?: Date;
}

export interface ConsumeBackupCodeData {
  usuarioId: number;
  expectedBackupCodes: string;
  replacementBackupCodes: string;
  newPasswordHash: string;
  now?: Date;
  remainingCodes: number;
}

const validTokenWhere = (tokenHash: string, now: Date) => ({
  tokenHash,
  usedAt: null,
  expiresAt: { gt: now }
});

class PasswordResetTokenRepository {
  async issueIfAllowed(data: PasswordResetTokenCreateData, now: Date, since: Date): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const recent = await tx.passwordResetToken.findFirst({
        where: { usuarioId: data.usuarioId, createdAt: { gte: since } },
        select: { id: true }
      });
      if (recent) return false;

      await tx.passwordResetToken.updateMany({
        where: { usuarioId: data.usuarioId, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now }
      });
      await tx.passwordResetToken.deleteMany({
        where: {
          usuarioId: data.usuarioId,
          OR: [
            { expiresAt: { lte: now } },
            { usedAt: { not: null }, createdAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } }
          ]
        }
      });
      await tx.passwordResetToken.create({ data });
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async invalidateForUser(usuarioId: number, now = new Date()): Promise<void> {
    await prisma.passwordResetToken.updateMany({
      where: {
        usuarioId,
        usedAt: null,
        expiresAt: { gt: now }
      },
      data: { usedAt: now }
    });

    await prisma.passwordResetToken.deleteMany({
      where: {
        usuarioId,
        OR: [
          { expiresAt: { lte: now } },
          { usedAt: { not: null }, createdAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } }
        ]
      }
    });
  }

  async create(data: PasswordResetTokenCreateData) {
    return prisma.passwordResetToken.create({ data });
  }

  async hasRecentRequest(usuarioId: number, since: Date): Promise<boolean> {
    const token = await prisma.passwordResetToken.findFirst({
      where: { usuarioId, createdAt: { gte: since } },
      select: { id: true }
    });
    return token !== null;
  }

  async deleteByHash(tokenHash: string): Promise<void> {
    await prisma.passwordResetToken.deleteMany({ where: { tokenHash } });
  }

  async findValidByHash(tokenHash: string, now = new Date()) {
    return prisma.passwordResetToken.findFirst({
      where: validTokenWhere(tokenHash, now),
      include: {
        usuario: {
          select: { idUsuario: true, email: true }
        }
      }
    });
  }

  async consumeAndReset({ tokenHash, newPasswordHash, now = new Date() }: ConsumePasswordResetData) {
    return prisma.$transaction(async (tx) => {
      const token = await tx.passwordResetToken.findFirst({
        where: validTokenWhere(tokenHash, now),
        select: { id: true, usuarioId: true }
      });

      if (!token) {
        throw new Error('Token inválido o expirado');
      }

      const claimed = await tx.passwordResetToken.updateMany({
        where: {
          id: token.id,
          usedAt: null,
          expiresAt: { gt: now }
        },
        data: { usedAt: now }
      });

      if (claimed.count !== 1) {
        throw new Error('Token inválido o expirado');
      }

      await tx.passwordResetToken.updateMany({
        where: { usuarioId: token.usuarioId, usedAt: null },
        data: { usedAt: now }
      });

      await tx.usuario.update({
        where: { idUsuario: token.usuarioId },
        data: {
          passwordHash: newPasswordHash,
          loginFailedCount: 0,
          loginLockedUntil: null
        }
      });

      await tx.sesion.updateMany({
        where: { usuarioId: token.usuarioId, revocadaEn: null },
        data: { revocadaEn: now, cerradaEn: now }
      });

      return { usuarioId: token.usuarioId };
    });
  }

  async resetPasswordForUser(usuarioId: number, newPasswordHash: string, now = new Date(), activate = false) {
    return prisma.$transaction(async (tx) => {
      // Mantener el mismo orden que consumeAndReset: tokens -> usuario -> sesiones.
      // Asi se evita que los dos recorridos inviertan los locks bajo concurrencia.
      await tx.passwordResetToken.updateMany({
        where: { usuarioId, usedAt: null },
        data: { usedAt: now }
      });

      await tx.usuario.update({
        where: { idUsuario: usuarioId },
        data: {
          passwordHash: newPasswordHash,
          loginFailedCount: 0,
          loginLockedUntil: null,
          ...(activate ? { activo: true } : {})
        }
      });

      await tx.sesion.updateMany({
        where: { usuarioId, revocadaEn: null },
        data: { revocadaEn: now, cerradaEn: now }
      });

      return { usuarioId };
    });
  }

  async consumeBackupCodeAndReset({
    usuarioId,
    expectedBackupCodes,
    replacementBackupCodes,
    newPasswordHash,
    now = new Date(),
    remainingCodes
  }: ConsumeBackupCodeData) {
    return prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: { usuarioId, usedAt: null },
        data: { usedAt: now }
      });

      const claimed = await tx.usuario.updateMany({
        where: { idUsuario: usuarioId, backupCodes: expectedBackupCodes },
        data: {
          backupCodes: replacementBackupCodes,
          passwordHash: newPasswordHash,
          activo: true,
          loginFailedCount: 0,
          loginLockedUntil: null
        }
      });
      if (claimed.count !== 1) {
        throw new Error('Código inválido');
      }

      await tx.sesion.updateMany({
        where: { usuarioId, revocadaEn: null },
        data: { revocadaEn: now, cerradaEn: now }
      });

      return { remainingCodes };
    });
  }
}

export default new PasswordResetTokenRepository();
