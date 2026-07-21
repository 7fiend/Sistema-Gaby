import type { CookieOptions, Request, Response } from 'express';
import type { LoginInput } from '@gaby/shared';
import type { Login } from '../../../application/use-cases/auth/Login.js';
import type { RefreshSession } from '../../../application/use-cases/auth/RefreshSession.js';
import type { Logout } from '../../../application/use-cases/auth/Logout.js';
import { UnauthorizedError } from '../../../domain/errors/AppError.js';
import { isDev } from '../../../config/env.js';
import { authUser } from '../middleware/auth.js';

const REFRESH_COOKIE = 'gaby_refresh';

/** Cookie httpOnly restringida a las rutas de auth: el JS nunca la ve. */
function cookieOptions(expires: Date): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: !isDev, // en producción detrás de HTTPS
    path: '/api/v1/auth',
    expires,
  };
}

function requestMeta(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

export class AuthController {
  constructor(
    private readonly loginUseCase: Login,
    private readonly refreshUseCase: RefreshSession,
    private readonly logoutUseCase: Logout,
  ) {}

  login = async (req: Request, res: Response): Promise<void> => {
    const result = await this.loginUseCase.execute(req.body as LoginInput, requestMeta(req));
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions(result.refreshExpiresAt));
    res.json({ data: { user: result.user, accessToken: result.accessToken } });
  };

  refresh = async (req: Request, res: Response): Promise<void> => {
    const token = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];
    if (!token) throw new UnauthorizedError('Sin sesión activa');
    const result = await this.refreshUseCase.execute(token, requestMeta(req));
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions(result.refreshExpiresAt));
    res.json({ data: { user: result.user, accessToken: result.accessToken } });
  };

  logout = async (req: Request, res: Response): Promise<void> => {
    const token = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];
    await this.logoutUseCase.execute(token);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    res.json({ data: { ok: true } });
  };

  me = (req: Request, res: Response): void => {
    res.json({ data: authUser(req) });
  };
}
