import type { AuthUser } from '@gaby/shared';
import { UnauthorizedError } from '../../../domain/errors/AppError.js';
import type { IUserRepository } from '../../../domain/repositories/IUserRepository.js';
import type { ISessionRepository } from '../../../domain/repositories/ISessionRepository.js';
import type { ITokenService } from '../../ports/ITokenService.js';
import type { IAuditLogger } from '../../ports/IAuditLogger.js';
import { env } from '../../../config/env.js';
import { generateRefreshToken, hashRefreshToken } from './AuthTokens.js';
import type { RequestMeta } from './Login.js';

export interface RefreshResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

/**
 * Rotación de refresh token: cada uso revoca el anterior y emite uno nuevo.
 * Si llega un token YA REVOCADO = posible robo → se revocan TODAS las
 * sesiones del usuario y queda evento SECURITY (detección de reutilización).
 */
export class RefreshSession {
  constructor(
    private readonly users: IUserRepository,
    private readonly sessions: ISessionRepository,
    private readonly tokens: ITokenService,
    private readonly audit: IAuditLogger,
  ) {}

  async execute(refreshToken: string, meta: RequestMeta): Promise<RefreshResult> {
    const session = await this.sessions.findByTokenHash(hashRefreshToken(refreshToken));
    if (!session) throw new UnauthorizedError('Sesión inválida');

    if (session.revokedAt) {
      await this.sessions.revokeAllForUser(session.userId);
      await this.audit.log({
        kind: 'SECURITY',
        userId: session.userId,
        action: 'auth.refresh.reuse-detected',
        metadata: { sessionId: session.id, ...meta },
      });
      throw new UnauthorizedError('Sesión inválida');
    }

    if (session.expiresAt < new Date()) {
      throw new UnauthorizedError('Sesión expirada');
    }

    const user = await this.users.findAuthById(session.userId);
    if (!user || !user.isActive) throw new UnauthorizedError('Usuario inactivo');

    // Rotación: el permiso vigente se re-lee de BD (cambios de rol aplican aquí)
    await this.sessions.revoke(session.id);
    const { token: newToken, hash } = generateRefreshToken();
    const refreshExpiresAt = new Date(
      Date.now() + env.JWT_REFRESH_EXPIRES_DAYS * 24 * 3600 * 1000,
    );
    await this.sessions.create({
      userId: user.id,
      refreshTokenHash: hash,
      expiresAt: refreshExpiresAt,
      userAgent: meta.userAgent,
      ip: meta.ip,
    });

    const authUser: AuthUser = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.roleName,
      permissions: user.permissions,
    };

    return {
      user: authUser,
      accessToken: this.tokens.signAccessToken(authUser),
      refreshToken: newToken,
      refreshExpiresAt,
    };
  }
}
