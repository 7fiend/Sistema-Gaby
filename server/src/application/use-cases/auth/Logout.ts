import type { ISessionRepository } from '../../../domain/repositories/ISessionRepository.js';
import type { IAuditLogger } from '../../ports/IAuditLogger.js';
import { hashRefreshToken } from './AuthTokens.js';

export class Logout {
  constructor(
    private readonly sessions: ISessionRepository,
    private readonly audit: IAuditLogger,
  ) {}

  async execute(refreshToken: string | undefined, userId?: string): Promise<void> {
    if (refreshToken) {
      const session = await this.sessions.findByTokenHash(hashRefreshToken(refreshToken));
      if (session && !session.revokedAt) {
        await this.sessions.revoke(session.id);
        await this.audit.log({
          kind: 'AUTH',
          userId: session.userId,
          action: 'auth.logout',
        });
        return;
      }
    }
    if (userId) {
      await this.audit.log({ kind: 'AUTH', userId, action: 'auth.logout' });
    }
  }
}
