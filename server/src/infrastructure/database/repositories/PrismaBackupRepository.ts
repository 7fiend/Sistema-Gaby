import type { Prisma, PrismaClient } from '@prisma/client';
import type { BackupsQuery, Paginated } from '@gaby/shared';
import type {
  BackupCompleteInput,
  BackupCreateInput,
  BackupRow,
  IBackupRepository,
} from '../../../domain/repositories/IBackupRepository.js';

const include = { createdBy: { select: { fullName: true } } } as const;
type Row = Prisma.BackupGetPayload<{ include: typeof include }>;

function toRow(r: Row): BackupRow {
  return {
    id: r.id,
    filename: r.filename,
    sizeBytes: Number(r.sizeBytes),
    type: r.type,
    status: r.status,
    error: r.error,
    createdById: r.createdById,
    createdBy: r.createdBy?.fullName ?? null,
    createdAt: r.createdAt,
  };
}

export class PrismaBackupRepository implements IBackupRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(input: BackupCreateInput): Promise<BackupRow> {
    const r = await this.db.backup.create({
      data: {
        filename: input.filename,
        type: input.type,
        createdById: input.createdById,
      },
      include,
    });
    return toRow(r);
  }

  async markCompleted(id: string, input: BackupCompleteInput): Promise<BackupRow> {
    const r = await this.db.backup.update({
      where: { id },
      data: { status: 'COMPLETED', sizeBytes: BigInt(input.sizeBytes) },
      include,
    });
    return toRow(r);
  }

  async markFailed(id: string, error: string): Promise<BackupRow> {
    const r = await this.db.backup.update({
      where: { id },
      data: { status: 'FAILED', error: error.slice(0, 2000) },
      include,
    });
    return toRow(r);
  }

  async list(query: BackupsQuery): Promise<Paginated<BackupRow>> {
    const where: Prisma.BackupWhereInput = query.type ? { type: query.type } : {};
    const [rows, total] = await this.db.$transaction([
      this.db.backup.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.backup.count({ where }),
    ]);
    return {
      items: rows.map(toRow),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async findById(id: string): Promise<BackupRow | null> {
    const r = await this.db.backup.findUnique({ where: { id }, include });
    return r ? toRow(r) : null;
  }

  async findOldestCompleted(keep: number): Promise<BackupRow[]> {
    const rows = await this.db.backup.findMany({
      where: { status: 'COMPLETED' },
      include,
      orderBy: { createdAt: 'desc' },
      skip: keep,
    });
    return rows.map(toRow);
  }

  async delete(id: string): Promise<void> {
    await this.db.backup.delete({ where: { id } });
  }
}
