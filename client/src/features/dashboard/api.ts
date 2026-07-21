import type { DashboardSummary } from '@gaby/shared';
import { api } from '@/lib/api';

export interface Alert {
  id: string;
  type: string;
  message: string;
  data: unknown;
  isRead: boolean;
  createdAt: string;
}

export const dashboardApi = {
  /** `date` = hoy local (YYYY-MM-DD): el servidor no adivina la zona horaria. */
  summary: (date: string) => api.get<DashboardSummary>(`/dashboard/summary?date=${date}`),
  alerts: (limit = 20) => api.get<Alert[]>(`/alerts?limit=${limit}`),
  markAlertRead: (id: string) => api.post<{ ok: boolean }>(`/alerts/${id}/read`),
};
