import type { Prisma, PrismaClient } from '@prisma/client';
import type { Paginated, SaleRecordInput, SalesQuery } from '@gaby/shared';
import type {
  ISaleRepository,
  SaleRecordDetail,
} from '../../../domain/repositories/ISaleRepository.js';
import { ConflictError, ValidationError } from '../../../domain/errors/AppError.js';
import { round2 } from '../../../domain/services/costing.js';
import { toDateOnlyUTC } from '../../../domain/services/production.js';

const recordInclude = {
  registeredBy: { select: { fullName: true } },
  items: {
    include: { recipe: { select: { id: true, name: true } } },
    orderBy: { recipe: { name: 'asc' } },
  },
} as const;

type RecordRow = Prisma.SaleRecordGetPayload<{ include: typeof recordInclude }>;

function toDetail(r: RecordRow): SaleRecordDetail {
  const items = r.items.map((i) => ({
    recipeId: i.recipe.id,
    recipeName: i.recipe.name,
    portions: i.portions,
    unitPrice: i.unitPrice.toNumber(),
    total: i.total.toNumber(),
  }));
  return {
    id: r.id,
    date: r.date,
    notes: r.notes,
    registeredBy: r.registeredBy.fullName,
    totalPortions: items.reduce((s, i) => s + i.portions, 0),
    totalAmount: round2(items.reduce((s, i) => s + i.total, 0)),
    items,
    createdAt: r.createdAt,
  };
}

export class PrismaSaleRepository implements ISaleRepository {
  constructor(private readonly db: PrismaClient) {}

  async list(query: SalesQuery): Promise<Paginated<SaleRecordDetail>> {
    const where: Prisma.SaleRecordWhereInput = {
      ...((query.from || query.to) && {
        date: {
          ...(query.from && { gte: toDateOnlyUTC(query.from) }),
          ...(query.to && { lte: toDateOnlyUTC(query.to) }),
        },
      }),
    };
    const [rows, total] = await this.db.$transaction([
      this.db.saleRecord.findMany({
        where,
        include: recordInclude,
        orderBy: { date: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.saleRecord.count({ where }),
    ]);
    return {
      items: rows.map(toDetail),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async findByDate(date: Date): Promise<SaleRecordDetail | null> {
    const r = await this.db.saleRecord.findUnique({
      where: { date: toDateOnlyUTC(date) },
      include: recordInclude,
    });
    return r ? toDetail(r) : null;
  }

  async create(input: SaleRecordInput, userId: string): Promise<SaleRecordDetail> {
    const date = toDateOnlyUTC(input.date);
    const id = await this.db.$transaction(async (tx) => {
      const existing = await tx.saleRecord.findUnique({ where: { date } });
      if (existing) {
        throw new ConflictError('Ya existe un registro de ventas para esta fecha');
      }
      const recipes = await tx.recipe.findMany({
        where: { id: { in: input.items.map((i) => i.recipeId) } },
        select: { id: true },
      });
      if (recipes.length !== input.items.length) {
        throw new ValidationError('Alguna de las recetas seleccionadas no existe');
      }
      const record = await tx.saleRecord.create({
        data: {
          date,
          notes: input.notes ?? null,
          registeredById: userId,
          items: {
            create: input.items.map((i) => ({
              recipeId: i.recipeId,
              portions: i.portions,
              unitPrice: i.unitPrice,
              total: round2(i.portions * i.unitPrice),
            })),
          },
        },
      });
      return record.id;
    });
    const r = await this.db.saleRecord.findUniqueOrThrow({
      where: { id },
      include: recordInclude,
    });
    return toDetail(r);
  }
}
