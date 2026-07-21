import type {
  Paginated,
  ProductionCreateInput,
  ProductionStatus,
  RequirementStatus,
} from '@gaby/shared';
import { api } from '@/lib/api';

export interface ProductionOrder {
  id: string;
  orderNumber: string;
  date: string;
  status: ProductionStatus;
  notes: string | null;
  createdBy: string;
  recipesCount: number;
  totalPortions: number;
  totalCostSnapshot: number;
  confirmedAt: string | null;
  createdAt: string;
}

export interface ProductionOrderItem {
  id: string;
  recipeId: string;
  recipeName: string;
  versionNumber: number;
  portions: number;
  costPerPortionSnapshot: number;
  totalCostSnapshot: number;
}

export interface Requirement {
  id: string;
  productId: string;
  productName: string;
  productCode: string;
  unitAbbreviation: string;
  isWeighable: boolean;
  requiredQuantity: number;
  deliveredQuantity: number;
  status: RequirementStatus;
  toleranceApplied: number;
}

export interface ProductionOrderDetail extends ProductionOrder {
  items: ProductionOrderItem[];
  requirements: Requirement[];
}

export interface AvailabilityLine {
  productId: string;
  productName: string;
  productCode: string;
  unitAbbreviation: string;
  required: number;
  available: number;
  missing: number;
}

function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

export const productionApi = {
  list: (params: { page: number; status?: string; from?: string; to?: string; search?: string }) =>
    api.get<Paginated<ProductionOrder>>(`/production${qs(params)}`),
  get: (id: string) => api.get<ProductionOrderDetail>(`/production/${id}`),
  availability: (id: string) => api.get<AvailabilityLine[]>(`/production/${id}/availability`),
  create: (input: ProductionCreateInput) => api.post<ProductionOrderDetail>('/production', input),
  confirm: (id: string) =>
    api.post<{ order: ProductionOrderDetail; shortages: AvailabilityLine[] }>(
      `/production/${id}/confirm`,
    ),
  cancel: (id: string) => api.post<ProductionOrderDetail>(`/production/${id}/cancel`),
  close: (id: string) => api.post<ProductionOrderDetail>(`/production/${id}/close`),
  start: (id: string) => api.post<ProductionOrderDetail>(`/production/${id}/start`),
  complete: (id: string) => api.post<ProductionOrderDetail>(`/production/${id}/complete`),
};
