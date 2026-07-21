import type { KitchenSummary } from '@gaby/shared';
import { api } from '@/lib/api';

export const kitchenApi = {
  summary: (date?: string) => api.get<KitchenSummary>(`/kitchen/summary${date ? `?date=${date}` : ''}`),
};
