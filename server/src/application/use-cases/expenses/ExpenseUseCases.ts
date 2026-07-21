import {
  SOCKET_ROOMS,
  type AuthUser,
  type ExpenseInput,
  type ExpensesQuery,
} from '@gaby/shared';
import type { IExpenseRepository } from '../../../domain/repositories/IExpenseRepository.js';
import { NotFoundError } from '../../../domain/errors/AppError.js';
import type { IAuditLogger } from '../../ports/IAuditLogger.js';
import type { IEventBus } from '../../ports/IEventBus.js';

/** Casos de uso de gastos operativos. */
export class ExpenseUseCases {
  constructor(
    private readonly expenses: IExpenseRepository,
    private readonly audit: IAuditLogger,
    private readonly events: IEventBus,
  ) {}

  list(query: ExpensesQuery) {
    return this.expenses.list(query);
  }

  async create(input: ExpenseInput, user: AuthUser) {
    const expense = await this.expenses.create(input, user.id);
    await this.audit.log({
      kind: 'CRUD',
      userId: user.id,
      action: 'expense.create',
      resource: 'expenses',
      resourceId: expense.id,
      after: input,
    });
    this.events.publish('expense:created', { expenseId: expense.id }, [SOCKET_ROOMS.ADMIN]);
    return expense;
  }

  async update(id: string, input: Partial<ExpenseInput>, user: AuthUser) {
    const before = await this.expenses.findById(id);
    if (!before) throw new NotFoundError('Gasto', id);
    const expense = await this.expenses.update(id, input);
    await this.audit.log({
      kind: 'CRUD',
      userId: user.id,
      action: 'expense.update',
      resource: 'expenses',
      resourceId: id,
      before: { amount: before.amount, description: before.description, date: before.date },
      after: input,
    });
    return expense;
  }
}
