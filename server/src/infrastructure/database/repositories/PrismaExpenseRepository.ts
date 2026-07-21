import type { Prisma, PrismaClient } from '@prisma/client';
import type { ExpenseInput, ExpensesQuery, Paginated } from '@gaby/shared';
import type {
  ExpenseItem,
  IExpenseRepository,
} from '../../../domain/repositories/IExpenseRepository.js';
import { toDateOnlyUTC } from '../../../domain/services/production.js';

const expenseInclude = {
  category: { select: { id: true, name: true } },
  createdBy: { select: { fullName: true } },
} as const;

type ExpenseRow = Prisma.ExpenseGetPayload<{ include: typeof expenseInclude }>;

function toItem(e: ExpenseRow): ExpenseItem {
  return {
    id: e.id,
    category: e.category,
    amount: e.amount.toNumber(),
    date: e.date,
    description: e.description,
    receiptUrl: e.receiptUrl,
    createdBy: e.createdBy.fullName,
    createdAt: e.createdAt,
  };
}

export class PrismaExpenseRepository implements IExpenseRepository {
  constructor(private readonly db: PrismaClient) {}

  async list(query: ExpensesQuery): Promise<Paginated<ExpenseItem>> {
    const where: Prisma.ExpenseWhereInput = {
      ...(query.categoryId && { categoryId: query.categoryId }),
      ...((query.from || query.to) && {
        date: {
          ...(query.from && { gte: toDateOnlyUTC(query.from) }),
          ...(query.to && { lte: toDateOnlyUTC(query.to) }),
        },
      }),
      ...(query.search && { description: { contains: query.search, mode: 'insensitive' } }),
    };
    const [rows, total] = await this.db.$transaction([
      this.db.expense.findMany({
        where,
        include: expenseInclude,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.expense.count({ where }),
    ]);
    return {
      items: rows.map(toItem),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async findById(id: string): Promise<ExpenseItem | null> {
    const e = await this.db.expense.findUnique({ where: { id }, include: expenseInclude });
    return e ? toItem(e) : null;
  }

  async create(input: ExpenseInput, userId: string): Promise<ExpenseItem> {
    const e = await this.db.expense.create({
      data: {
        categoryId: input.categoryId,
        amount: input.amount,
        date: toDateOnlyUTC(input.date),
        description: input.description,
        receiptUrl: input.receiptUrl ?? null,
        createdById: userId,
      },
      include: expenseInclude,
    });
    return toItem(e);
  }

  async update(id: string, input: Partial<ExpenseInput>): Promise<ExpenseItem> {
    const e = await this.db.expense.update({
      where: { id },
      data: {
        ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
        ...(input.amount !== undefined && { amount: input.amount }),
        ...(input.date !== undefined && { date: toDateOnlyUTC(input.date) }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.receiptUrl !== undefined && { receiptUrl: input.receiptUrl }),
      },
      include: expenseInclude,
    });
    return toItem(e);
  }
}
