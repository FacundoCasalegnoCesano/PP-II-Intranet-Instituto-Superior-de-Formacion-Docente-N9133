import { prisma } from '../config/prisma.js';

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

const validTokenWhere = (tokenHash: string, now: Date) => ({
  tokenHash,
  usedAt: null,
  expiresAt: { gt: now }
});

class PasswordResetTokenRepository {
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

      await tx.usuario.update({
        where: { idUsuario: token.usuarioId },
        data: { passwordHash: newPasswordHash }
      });

      await tx.sesion.updateMany({
        where: { usuarioId: token.usuarioId, revocadaEn: null },
        data: { revocadaEn: now, cerradaEn: now }
      });

      return { usuarioId: token.usuarioId };
    });
  }
}

export default new PasswordResetTokenRepository();
