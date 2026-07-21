import type { Prisma, PrismaClient } from '@prisma/client';
import type { Paginated, PermissionKey, UsersQuery } from '@gaby/shared';
import type {
  IUserRepository,
  RoleItem,
  UserAuthData,
  UserListItem,
} from '../../../domain/repositories/IUserRepository.js';

const authInclude = {
  role: { include: { permissions: { include: { permission: true } } } },
} as const;

type UserWithRole = NonNullable<
  Awaited<ReturnType<PrismaClient['user']['findUnique']>>
> & {
  role: {
    name: string;
    permissions: { permission: { resource: string; action: string } }[];
  };
};

function toAuthData(u: UserWithRole): UserAuthData {
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    passwordHash: u.passwordHash,
    isActive: u.isActive,
    failedAttempts: u.failedAttempts,
    lockedUntil: u.lockedUntil,
    roleName: u.role.name,
    permissions: u.role.permissions.map(
      (rp) => `${rp.permission.resource}:${rp.permission.action}` as PermissionKey,
    ),
  };
}

export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly db: PrismaClient) {}

  async findAuthByUsername(username: string): Promise<UserAuthData | null> {
    const user = await this.db.user.findUnique({ where: { username }, include: authInclude });
    return user ? toAuthData(user as UserWithRole) : null;
  }

  async findAuthById(id: string): Promise<UserAuthData | null> {
    const user = await this.db.user.findUnique({ where: { id }, include: authInclude });
    return user ? toAuthData(user as UserWithRole) : null;
  }

  async registerFailedAttempt(userId: string, lockedUntil: Date | null): Promise<void> {
    await this.db.user.update({
      where: { id: userId },
      data: { failedAttempts: { increment: 1 }, ...(lockedUntil && { lockedUntil }) },
    });
  }

  async resetFailedAttempts(userId: string): Promise<void> {
    await this.db.user.update({
      where: { id: userId },
      data: { failedAttempts: 0, lockedUntil: null },
    });
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.db.user.update({ where: { id: userId }, data: { passwordHash } });
  }

  // --- Administración (entrega 9c) ---

  private static listSelect = {
    id: true,
    username: true,
    fullName: true,
    email: true,
    isActive: true,
    lockedUntil: true,
    createdAt: true,
    role: { select: { id: true, name: true } },
  } satisfies Prisma.UserSelect;

  async listUsers(query: UsersQuery): Promise<Paginated<UserListItem>> {
    const where: Prisma.UserWhereInput = {
      ...(!query.includeInactive && { isActive: true }),
      ...(query.search && {
        OR: [
          { username: { contains: query.search, mode: 'insensitive' } },
          { fullName: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };
    const [rows, total] = await this.db.$transaction([
      this.db.user.findMany({
        where,
        select: PrismaUserRepository.listSelect,
        orderBy: { username: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.user.count({ where }),
    ]);
    return {
      items: rows,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async listRoles(): Promise<RoleItem[]> {
    return this.db.role.findMany({
      select: { id: true, name: true, description: true },
      orderBy: { name: 'asc' },
    });
  }

  async findListItem(id: string): Promise<UserListItem | null> {
    return this.db.user.findUnique({ where: { id }, select: PrismaUserRepository.listSelect });
  }

  async createUser(data: {
    username: string;
    fullName: string;
    email: string | null;
    roleId: string;
    passwordHash: string;
  }): Promise<UserListItem> {
    return this.db.user.create({ data, select: PrismaUserRepository.listSelect });
  }

  async updateUser(
    id: string,
    data: Partial<{ fullName: string; email: string | null; roleId: string; isActive: boolean }>,
  ): Promise<UserListItem> {
    return this.db.user.update({ where: { id }, data, select: PrismaUserRepository.listSelect });
  }
}
