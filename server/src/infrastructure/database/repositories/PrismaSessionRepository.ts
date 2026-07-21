import type { PrismaClient } from '@prisma/client';
import type {
  ISessionRepository,
  SessionData,
} from '../../../domain/repositories/ISessionRepository.js';

export class PrismaSessionRepository implements ISessionRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(data: {
    userId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    userAgent?: string;
    ip?: string;
  }): Promise<SessionData> {
    const s = await this.db.session.create({ data });
    return { id: s.id, userId: s.userId, expiresAt: s.expiresAt, revokedAt: s.revokedAt };
  }

  async findByTokenHash(hash: string): Promise<SessionData | null> {
    const s = await this.db.session.findUnique({ where: { refreshTokenHash: hash } });
    return s ? { id: s.id, userId: s.userId, expiresAt: s.expiresAt, revokedAt: s.revokedAt } : null;
  }

  async revoke(sessionId: string): Promise<void> {
    await this.db.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.db.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
