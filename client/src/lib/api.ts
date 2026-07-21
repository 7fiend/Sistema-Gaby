import { API_PREFIX, type ApiError, type AuthUser } from '@gaby/shared';
import { useAuth } from '@/stores/auth';

/**
 * Cliente HTTP tipado único (AD-05).
 * - Rutas relativas: en dev pasan por el proxy de Vite; en producción,
 *   VITE_API_URL permite apuntar a otro host (RNF-02).
 * - Adjunta el access token; ante 401 intenta UN refresh (cookie httpOnly)
 *   y reintenta la petición. Si falla, la sesión pasa a anónima.
 * - Desenvuelve el envelope { data } y convierte { error } en ApiRequestError.
 */
const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export class ApiRequestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function rawRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const { accessToken } = useAuth.getState();
  const res = await fetch(`${BASE_URL}${API_PREFIX}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      ...init?.headers,
    },
  });

  const body = (await res.json().catch(() => null)) as { data?: T } | ApiError | null;

  if (!res.ok) {
    const err = body && 'error' in body ? body.error : undefined;
    throw new ApiRequestError(
      err?.code ?? 'INTERNAL',
      err?.message ?? 'Error de conexión con el servidor',
      res.status,
      err?.details,
    );
  }
  return (body as { data: T }).data;
}

/** Refresh compartido: si varias requests fallan a la vez, un solo refresh. */
let refreshPromise: Promise<boolean> | null = null;

export async function tryRefreshSession(): Promise<boolean> {
  refreshPromise ??= (async () => {
    try {
      const result = await rawRequest<{ user: AuthUser; accessToken: string }>('/auth/refresh', {
        method: 'POST',
      });
      useAuth.getState().setSession(result.user, result.accessToken);
      return true;
    } catch {
      useAuth.getState().setAnonymous();
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await rawRequest<T>(path, init);
  } catch (e) {
    const isAuthPath = path.startsWith('/auth/');
    if (e instanceof ApiRequestError && e.status === 401 && !isAuthPath) {
      if (await tryRefreshSession()) {
        return rawRequest<T>(path, init); // reintento único con token nuevo
      }
    }
    throw e;
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  put: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(data) }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/**
 * Descarga de archivos (Reportes, Fase 12): la única ruta que NO responde el
 * envelope `{ data }` — el éxito es el archivo binario. Mismo manejo de 401
 * (un solo refresh) que `request()`, pero devuelve un Blob en vez de JSON.
 */
async function rawDownload(path: string, init?: RequestInit): Promise<{ blob: Blob; filename: string }> {
  const { accessToken } = useAuth.getState();
  const res = await fetch(`${BASE_URL}${API_PREFIX}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    const err = body && 'error' in body ? body.error : undefined;
    throw new ApiRequestError(
      err?.code ?? 'INTERNAL',
      err?.message ?? 'Error de conexión con el servidor',
      res.status,
      err?.details,
    );
  }
  const match = /filename="?([^"]+)"?/.exec(res.headers.get('Content-Disposition') ?? '');
  return { blob: await res.blob(), filename: match?.[1] ?? 'archivo' };
}

/** Descarga un archivo y dispara el guardado en el navegador (ancla sintética). */
export async function downloadFile(path: string, init?: RequestInit): Promise<void> {
  let result: { blob: Blob; filename: string };
  try {
    result = await rawDownload(path, init);
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 401 && (await tryRefreshSession())) {
      result = await rawDownload(path, init);
    } else {
      throw e;
    }
  }
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
