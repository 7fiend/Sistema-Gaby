import type { Paginated, ReportRecord, ReportResult, ReportType } from '@gaby/shared';
import { api, downloadFile } from '@/lib/api';

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  sales: 'Ventas',
  production: 'Producción',
  expenses: 'Gastos',
  profit: 'Utilidad',
  inventory_value: 'Inventario valorizado',
  waste: 'Desperdicios y mermas',
  recipe_profitability: 'Rentabilidad por receta',
  top_recipes: 'Top recetas',
  top_ingredients: 'Top ingredientes',
};

export const reportsApi = {
  generate: (type: ReportType, from: string, to: string) =>
    api.get<ReportResult>(`/reports/${type}?from=${from}&to=${to}`),
  export: (type: ReportType, from: string, to: string, format: 'PDF' | 'XLSX' | 'CSV') =>
    downloadFile(`/reports/${type}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, format }),
    }),
  list: (params: { page: number; type?: ReportType }) =>
    api.get<Paginated<ReportRecord>>(
      `/reports?page=${params.page}${params.type ? `&type=${params.type}` : ''}`,
    ),
  download: (id: string) => downloadFile(`/reports/${id}/download`),
};
