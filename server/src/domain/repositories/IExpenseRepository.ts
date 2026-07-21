import type { ExpenseInput, ExpensesQuery, Paginated } from '@gaby/shared';

export interface ExpenseItem {
  id: string;
  category: { id: string; name: string };
  amount: number;
  date: Date;
  description: string;
  receiptUrl: string | null;
  createdBy: string;
  createdAt: Date;
}

export interface IExpenseRepository {
  list(query: ExpensesQuery): Promise<Paginated<ExpenseItem>>;
  findById(id: string): Promise<ExpenseItem | null>;
  create(input: ExpenseInput, userId: string): Promise<ExpenseItem>;
  update(id: string, input: Partial<ExpenseInput>): Promise<ExpenseItem>;
}
