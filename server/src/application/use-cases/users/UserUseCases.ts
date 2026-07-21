import type {
  AuthUser,
  UserCreateInput,
  UserResetPasswordInput,
  UserUpdateInput,
  UsersQuery,
} from '@gaby/shared';
import type { IUserRepository, UserListItem } from '../../../domain/repositories/IUserRepository.js';
import type { ISessionRepository } from '../../../domain/repositories/ISessionRepository.js';
import { ConflictError, NotFoundError, ValidationError } from '../../../domain/errors/AppError.js';
import type { IPasswordHasher } from '../../ports/IPasswordHasher.js';
import type { IAuditLogger } from '../../ports/IAuditLogger.js';

/** '' del formulario → null (email es único en BD; '' duplicado la rompería). */
function normalizeEmail(email: string | null | undefined): string | null {
  return email ? email : null;
}

/** Vista del usuario para auditoría (sin credenciales). */
function auditView(u: UserListItem) {
  return {
    username: u.username,
    fullName: u.fullName,
    email: u.email,
    role: u.role.name,
    isActive: u.isActive,
  };
}

/**
 * Administración de usuarios (entrega 9c). Los permisos viajan en el JWT,
 * así que todo cambio de rol/estado/contraseña revoca las sesiones del
 * usuario: el acceso viejo muere en ≤15 min (vida del access token).
 */
export class UserUseCases {
  constructor(
    private readonly users: IUserRepository,
    private readonly sessions: ISessionRepository,
    private readonly hasher: IPasswordHasher,
    private readonly audit: IAuditLogger,
  ) {}

  list(query: UsersQuery) {
    return this.users.listUsers(query);
  }

  roles() {
    return this.users.listRoles();
  }

  async create(input: UserCreateInput, actor: AuthUser): Promise<UserListItem> {
    const existing = await this.users.findAuthByUsername(input.username);
    if (existing) throw new ConflictError('El nombre de usuario ya existe');

    const user = await this.users.createUser({
      username: input.username,
      fullName: input.fullName,
      email: normalizeEmail(input.email),
      roleId: input.roleId,
      passwordHash: await this.hasher.hash(input.password),
    });

    await this.audit.log({
      kind: 'CRUD',
      userId: actor.id,
      action: 'user.create',
      resource: 'users',
      resourceId: user.id,
      after: auditView(user),
    });
    return user;
  }

  async update(id: string, input: UserUpdateInput, actor: AuthUser): Promise<UserListItem> {
    const before = await this.users.findListItem(id);
    if (!before) throw new NotFoundError('Usuario', id);

    const changesRole = input.roleId !== undefined && input.roleId !== before.role.id;
    const deactivates = input.isActive === false && before.isActive;
    if (id === actor.id && changesRole) {
      throw new ValidationError('No puedes cambiar tu propio rol');
    }
    if (id === actor.id && deactivates) {
      throw new ValidationError('No puedes desactivar tu propia cuenta');
    }

    const user = await this.users.updateUser(id, {
      ...(input.fullName !== undefined && { fullName: input.fullName }),
      ...(input.email !== undefined && { email: normalizeEmail(input.email) }),
      ...(input.roleId !== undefined && { roleId: input.roleId }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    });

    // Cambio de permisos efectivos → matar sesiones (el refresh dejará de funcionar)
    if (changesRole || deactivates) await this.sessions.revokeAllForUser(id);

    await this.audit.log({
      kind: 'CRUD',
      userId: actor.id,
      action: 'user.update',
      resource: 'users',
      resourceId: id,
      before: auditView(before),
      after: auditView(user),
    });
    return user;
  }

  async deactivate(id: string, actor: AuthUser): Promise<void> {
    await this.update(id, { isActive: false }, actor);
  }

  /** También desbloquea la cuenta (failedAttempts/lockedUntil a cero). */
  async resetPassword(id: string, input: UserResetPasswordInput, actor: AuthUser): Promise<void> {
    const user = await this.users.findListItem(id);
    if (!user) throw new NotFoundError('Usuario', id);

    await this.users.updatePassword(id, await this.hasher.hash(input.newPassword));
    await this.users.resetFailedAttempts(id);
    await this.sessions.revokeAllForUser(id);

    await this.audit.log({
      kind: 'SECURITY',
      userId: actor.id,
      action: 'user.reset-password',
      resource: 'users',
      resourceId: id,
      metadata: { username: user.username },
    });
  }
}
