import type { AuthUser, LoginInput } from '@gaby/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/stores/auth';

interface SessionResponse {
  user: AuthUser;
  accessToken: string;
}

export async function login(input: LoginInput): Promise<AuthUser> {
  const result = await api.post<SessionResponse>('/auth/login', input);
  useAuth.getState().setSession(result.user, result.accessToken);
  return result.user;
}

export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } finally {
    useAuth.getState().setAnonymous();
  }
}
