export interface SessionData {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface ISessionRepository {
  create(data: {
    userId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    userAgent?: string;
    ip?: string;
  }): Promise<SessionData>;
  findByTokenHash(hash: string): Promise<SessionData | null>;
  revoke(sessionId: string): Promise<void>;
  /** Revocación masiva: detección de reutilización de refresh token. */
  revokeAllForUser(userId: string): Promise<void>;
}
