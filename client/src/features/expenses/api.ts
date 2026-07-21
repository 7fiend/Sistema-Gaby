import type { ExpenseInput, Paginated } from '@gaby/shared';
import { api } from '@/lib/api';

export interface Expense {
  id: string;
  category: { id: string; name: string };
  amount: number;
  date: string;
  description: string;
  receiptUrl: string | null;
  createdBy: string;
  createdAt: string;
}

function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

export const expensesApi = {
  list: (params: { page: number; search?: string; categoryId?: string; from?: string; to?: string }) =>
    api.get<Paginated<Expense>>(`/expenses${qs(params)}`),
  create: (input: ExpenseInput) => api.post<Expense>('/expenses', input),
  update: (id: string, input: Partial<ExpenseInput>) => api.put<Expense>(`/expenses/${id}`, input),
};
