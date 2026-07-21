import { ERROR_CODES, SETTING_KEYS, type AuthUser, type LoginInput } from '@gaby/shared';
import { UnauthorizedError } from '../../../domain/errors/AppError.js';
import type { IUserRepository, UserAuthData } from '../../../domain/repositories/IUserRepository.js';
import type { ISessionRepository } from '../../../domain/repositories/ISessionRepository.js';
import type { ISettingsRepository } from '../../../domain/repositories/ISettingsRepository.js';
import type { IPasswordHasher } from '../../ports/IPasswordHasher.js';
import type { ITokenService } from '../../ports/ITokenService.js';
import type { IAuditLogger } from '../../ports/IAuditLogger.js';
import { env } from '../../../config/env.js';
import { generateRefreshToken } from './AuthTokens.js';

export interface LoginResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

function toAuthUser(u: UserAuthData): AuthUser {
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    role: u.roleName,
    permissions: u.permissions,
  };
}

export class Login {
  constructor(
    private readonly users: IUserRepository,
    private readonly sessions: ISessionRepository,
    private readonly settings: ISettingsRepository,
    private readonly hasher: IPasswordHasher,
    private readonly tokens: ITokenService,
    private readonly audit: IAuditLogger,
  ) {}

  async execute(input: LoginInput, meta: RequestMeta): Promise<LoginResult> {
    const user = await this.users.findAuthByUsername(input.username);

    // Mensaje idéntico exista o no el usuario: no filtrar información
    const invalid = () =>
      new UnauthorizedError('Usuario o contraseña incorrectos', ERROR_CODES.INVALID_CREDENTIALS);

    if (!user || !user.isActive) {
      await this.audit.log({
        kind: 'SECURITY',
        action: 'auth.login.failed',
        metadata: { username: input.username, reason: !user ? 'unknown_user' : 'inactive', ...meta },
      });
      throw invalid();
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.audit.log({
        kind: 'SECURITY',
        userId: user.id,
        action: 'auth.login.locked',
        metadata: { lockedUntil: user.lockedUntil.toISOString(), ...meta },
      });
      throw new UnauthorizedError(
        'Cuenta bloqueada temporalmente por intentos fallidos. Intenta más tarde.',
        ERROR_CODES.ACCOUNT_LOCKED,
      );
    }

    const passwordOk = await this.hasher.verify(user.passwordHash, input.password);
    if (!passwordOk) {
      const maxAttempts = await this.settings.getNumber(SETTING_KEYS.AUTH_MAX_FAILED_ATTEMPTS, 5);
      const lockMinutes = await this.settings.getNumber(SETTING_KEYS.AUTH_LOCK_MINUTES, 15);
      const willLock = user.failedAttempts + 1 >= maxAttempts;
      await this.users.registerFailedAttempt(
        user.id,
        willLock ? new Date(Date.now() + lockMinutes * 60_000) : null,
      );
      await this.audit.log({
        kind: 'SECURITY',
        userId: user.id,
        action: willLock ? 'auth.login.lock-triggered' : 'auth.login.failed',
        metadata: { attempt: user.failedAttempts + 1, maxAttempts, ...meta },
      });
      throw invalid();
    }

    await this.users.resetFailedAttempts(user.id);

    const authUser = toAuthUser(user);
    const accessToken = this.tokens.signAccessToken(authUser);
    const { token: refreshToken, hash } = generateRefreshToken();
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

    await this.audit.log({
      kind: 'AUTH',
      userId: user.id,
      action: 'auth.login.success',
      metadata: { ...meta },
    });

    return { user: authUser, accessToken, refreshToken, refreshExpiresAt };
  }
}
