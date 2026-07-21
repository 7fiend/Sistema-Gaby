import jwt from 'jsonwebtoken';
import { ERROR_CODES, type AuthUser } from '@gaby/shared';
import type { ITokenService } from '../../application/ports/ITokenService.js';
import { UnauthorizedError } from '../../domain/errors/AppError.js';
import { env } from '../../config/env.js';

export class JwtTokenService implements ITokenService {
  signAccessToken(user: AuthUser): string {
    const payload = {
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      permissions: user.permissions,
    };
    return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
      subject: user.id,
      expiresIn: env.JWT_ACCESS_EXPIRES as jwt.SignOptions['expiresIn'],
      issuer: 'sistema-gaby',
    });
  }

  verifyAccessToken(token: string): AuthUser {
    try {
      const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
        issuer: 'sistema-gaby',
      }) as jwt.JwtPayload & Omit<AuthUser, 'id'>;
      return {
        id: decoded.sub as string,
        username: decoded.username,
        fullName: decoded.fullName,
        role: decoded.role,
        permissions: decoded.permissions,
      };
    } catch (e) {
      if (e instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('Sesión expirada', ERROR_CODES.TOKEN_EXPIRED);
      }
      throw new UnauthorizedError('Token inválido');
    }
  }
}
