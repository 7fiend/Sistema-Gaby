import type { AuthUser } from '@gaby/shared';

export interface ITokenService {
  signAccessToken(user: AuthUser): string;
  /** Lanza UnauthorizedError(TOKEN_EXPIRED | UNAUTHORIZED) si es inválido. */
  verifyAccessToken(token: string): AuthUser;
}
