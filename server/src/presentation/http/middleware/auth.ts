import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { can, type AuthUser, type PermissionKey } from '@gaby/shared';
import { ForbiddenError, UnauthorizedError } from '../../../domain/errors/AppError.js';
import type { ITokenService } from '../../../application/ports/ITokenService.js';
import type { IAuditLogger } from '../../../application/ports/IAuditLogger.js';

// Augmentación del Request de Express con el usuario autenticado
declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

/** Extrae y verifica el JWT del header Authorization: Bearer. */
export function requireAuth(tokens: ITokenService): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return next(new UnauthorizedError());
    }
    try {
      req.user = tokens.verifyAccessToken(header.slice(7));
      next();
    } catch (e) {
      next(e);
    }
  };
}

/**
 * Autorización por permiso granular (matriz de @gaby/shared).
 * Los permisos viajan en el JWT: cero consultas a BD por request.
 * Cambios de rol aplican en el siguiente refresh (≤15 min) o al revocar sesión.
 */
export function requirePermission(key: PermissionKey, audit?: IAuditLogger): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!can(req.user, key)) {
      void audit?.log({
        kind: 'SECURITY',
        userId: req.user.id,
        action: 'auth.permission.denied',
        metadata: { required: key, path: req.path, method: req.method },
      });
      return next(new ForbiddenError());
    }
    next();
  };
}

/** Utilidad para los controllers: usuario garantizado por requireAuth. */
export function authUser(req: Request): AuthUser {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
}
