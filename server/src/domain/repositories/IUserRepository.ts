import type { Paginated, PermissionKey, UsersQuery } from '@gaby/shared';

/** Usuario con credenciales y permisos resueltos (para autenticación). */
export interface UserAuthData {
  id: string;
  username: string;
  fullName: string;
  passwordHash: string;
  isActive: boolean;
  failedAttempts: number;
  lockedUntil: Date | null;
  roleName: string;
  permissions: PermissionKey[];
}

/** Fila del listado de administración de usuarios (sin credenciales). */
export interface UserListItem {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  role: { id: string; name: string };
  isActive: boolean;
  lockedUntil: Date | null;
  createdAt: Date;
}

export interface RoleItem {
  id: string;
  name: string;
  description: string | null;
}

export interface IUserRepository {
  findAuthByUsername(username: string): Promise<UserAuthData | null>;
  findAuthById(id: string): Promise<UserAuthData | null>;
  registerFailedAttempt(userId: string, lockedUntil: Date | null): Promise<void>;
  resetFailedAttempts(userId: string): Promise<void>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;

  // --- Administración (entrega 9c) ---
  listUsers(query: UsersQuery): Promise<Paginated<UserListItem>>;
  listRoles(): Promise<RoleItem[]>;
  findListItem(id: string): Promise<UserListItem | null>;
  createUser(data: {
    username: string;
    fullName: string;
    email: string | null;
    roleId: string;
    passwordHash: string;
  }): Promise<UserListItem>;
  updateUser(
    id: string,
    data: Partial<{ fullName: string; email: string | null; roleId: string; isActive: boolean }>,
  ): Promise<UserListItem>;
}
