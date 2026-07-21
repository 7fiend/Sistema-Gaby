import { create } from 'zustand';
import type { AuthUser } from '@gaby/shared';

/**
 * Sesión en memoria (AD-08): el access token NUNCA toca localStorage
 * (mitiga XSS). Al recargar la página, RequireAuth llama /auth/refresh
 * — la cookie httpOnly reconstruye la sesión.
 */
interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  status: 'unknown' | 'authenticated' | 'anonymous';
  setSession: (user: AuthUser, accessToken: string) => void;
  setAnonymous: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  status: 'unknown',
  setSession: (user, accessToken) => set({ user, accessToken, status: 'authenticated' }),
  setAnonymous: () => set({ user: null, accessToken: null, status: 'anonymous' }),
}));

/** Ruta "hogar" según el rol (redirección tras login y en guards). */
export function homeForRole(role: string): string {
  switch (role) {
    case 'INVENTORY':
      return '/bodega';
    case 'KITCHEN':
      return '/cocina';
    default:
      return '/admin'; // ADMIN y AUDITOR
  }
}
