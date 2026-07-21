import type { Prisma, PrismaClient } from '@prisma/client';
import type { AuditQuery, Paginated } from '@gaby/shared';
import type { AuditLogRow, IAuditRepository } from '../../../domain/repositories/IAuditRepository.js';

const include = { user: { select: { username: true, fullName: true } } } as const;
type Row = Prisma.AuditLogGetPayload<{ include: typeof include }>;

function toRow(r: Row): AuditLogRow {
  return {
    id: r.id,
    kind: r.kind,
    userId: r.userId,
    username: r.user?.username ?? null,
    fullName: r.user?.fullName ?? null,
    action: r.action,
    resource: r.resource,
    resourceId: r.resourceId,
    before: r.before,
    after: r.after,
    metadata: r.metadata,
    createdAt: r.createdAt,
  };
}

export class PrismaAuditRepository implements IAuditRepository {
  constructor(private readonly db: PrismaClient) {}

  async list(query: AuditQuery): Promise<Paginated<AuditLogRow>> {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.userId && { userId: query.userId }),
      ...(query.kind && { kind: query.kind }),
      ...((query.from || query.to) && {
        createdAt: {
          ...(query.from && { gte: query.from }),
          ...(query.to && { lte: query.to }),
        },
      }),
      ...(query.search && {
        OR: [
          { action: { contains: query.search, mode: 'insensitive' } },
          { resource: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [rows, total] = await this.db.$transaction([
      this.db.auditLog.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.auditLog.count({ where }),
    ]);
    return {
      items: rows.map(toRow),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }
}
