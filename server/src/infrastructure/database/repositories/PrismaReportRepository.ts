import type { Prisma, PrismaClient } from '@prisma/client';
import type { Paginated, ReportsQuery } from '@gaby/shared';
import type {
  IReportRepository,
  ReportCreateInput,
  ReportRow,
} from '../../../domain/repositories/IReportRepository.js';

const include = { createdBy: { select: { fullName: true } } } as const;
type Row = Prisma.ReportGetPayload<{ include: typeof include }>;

function toRow(r: Row): ReportRow {
  return {
    id: r.id,
    type: r.type as ReportRow['type'],
    format: r.format,
    params: r.params,
    filePath: r.filePath,
    createdBy: r.createdBy.fullName,
    createdAt: r.createdAt,
  };
}

export class PrismaReportRepository implements IReportRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(input: ReportCreateInput): Promise<ReportRow> {
    const r = await this.db.report.create({
      data: {
        type: input.type,
        params: input.params as Prisma.InputJsonValue,
        format: input.format,
        filePath: input.filePath,
        createdById: input.createdById,
      },
      include,
    });
    return toRow(r);
  }

  async list(query: ReportsQuery): Promise<Paginated<ReportRow>> {
    const where = query.type ? { type: query.type } : {};
    const [rows, total] = await this.db.$transaction([
      this.db.report.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.report.count({ where }),
    ]);
    return {
      items: rows.map(toRow),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async findById(id: string): Promise<ReportRow | null> {
    const r = await this.db.report.findUnique({ where: { id }, include });
    return r ? toRow(r) : null;
  }
}
