import type {
  Paginated,
  UserCreateInput,
  UserResetPasswordInput,
  UserUpdateInput,
} from '@gaby/shared';
import { api } from '@/lib/api';

export interface UserItem {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  role: { id: string; name: string };
  isActive: boolean;
  lockedUntil: string | null;
  createdAt: string;
}

export interface RoleItem {
  id: string;
  name: string;
  description: string | null;
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

export const usersApi = {
  list: (params: { page: number; search?: string; includeInactive?: boolean }) =>
    api.get<Paginated<UserItem>>(`/users${qs(params)}`),
  roles: () => api.get<RoleItem[]>('/users/roles'),
  create: (input: UserCreateInput) => api.post<UserItem>('/users', input),
  update: (id: string, input: UserUpdateInput) => api.put<UserItem>(`/users/${id}`, input),
  deactivate: (id: string) => api.post<{ ok: boolean }>(`/users/${id}/deactivate`),
  resetPassword: (id: string, input: UserResetPasswordInput) =>
    api.post<{ ok: boolean }>(`/users/${id}/reset-password`, input),
};

/** Nombres de rol para la UI (los names de BD son estables — seed Fase 3). */
export const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  INVENTORY: 'Bodega',
  KITCHEN: 'Cocina',
  AUDITOR: 'Auditor',
};
