import type { Paginated, SaleRecordInput } from '@gaby/shared';
import { api } from '@/lib/api';

export interface SaleItem {
  recipeId: string;
  recipeName: string;
  portions: number;
  unitPrice: number;
  total: number;
}

export interface SaleRecord {
  id: string;
  date: string;
  notes: string | null;
  registeredBy: string;
  totalPortions: number;
  totalAmount: number;
  items: SaleItem[];
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

export const salesApi = {
  list: (params: { page: number; from?: string; to?: string }) =>
    api.get<Paginated<SaleRecord>>(`/sales${qs(params)}`),
  day: (date: string) => api.get<SaleRecord | null>(`/sales/day?date=${date}`),
  register: (input: SaleRecordInput) => api.post<SaleRecord>('/sales', input),
};
