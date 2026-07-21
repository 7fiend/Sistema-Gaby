import type {
  AdjustmentInput,
  CategoryCreateInput,
  CategoryUpdateInput,
  EntryInput,
  Paginated,
  ProductInput,
  ProductUsageType,
  RoutineConsumptionInput,
} from '@gaby/shared';
import { api } from '@/lib/api';

export interface Product {
  id: string;
  code: string;
  name: string;
  category: { id: string; name: string };
  unit: { id: string; abbreviation: string };
  supplier: { id: string; name: string } | null;
  currentStock: number;
  minStock: number;
  avgCost: number;
  lastCost: number;
  location: string | null;
  isWeighable: boolean;
  toleranceKg: number | null;
  usageType: ProductUsageType;
  isActive: boolean;
}

export interface Batch {
  id: string;
  batchNumber: string;
  initialQuantity: number;
  remainingQuantity: number;
  unitCost: number;
  expiryDate: string | null;
  receivedAt: string;
}

export interface Movement {
  id: string;
  type: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  balanceAfter: number;
  reason: string | null;
  batchNumber: string | null;
  userName: string;
  createdAt: string;
}

export interface ProductDetail extends Product {
  batches: Batch[];
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

export const inventoryApi = {
  list: (params: {
    page: number;
    pageSize?: number;
    search?: string;
    categoryId?: string;
    lowStock?: boolean;
    usageType?: ProductUsageType;
  }) => api.get<Paginated<Product>>(`/products${qs(params)}`),
  get: (id: string) => api.get<ProductDetail>(`/products/${id}`),
  movements: (id: string, page: number) =>
    api.get<Paginated<Movement>>(`/products/${id}/movements${qs({ page })}`),
  create: (input: ProductInput) => api.post<Product>('/products', input),
  update: (id: string, input: Partial<ProductInput>) => api.put<Product>(`/products/${id}`, input),
  deactivate: (id: string) => api.post(`/products/${id}/deactivate`),
  registerEntry: (input: EntryInput) => api.post('/inventory/entries', input),
  registerAdjustment: (input: AdjustmentInput) => api.post('/inventory/adjustments', input),
  registerRoutineConsumption: (input: RoutineConsumptionInput) =>
    api.post('/inventory/routine-consumption', input),
};

export interface CatalogUnit {
  id: string;
  name: string;
  abbreviation: string;
  kind: string;
  factorToBase: number;
}
export interface CatalogCategory {
  id: string;
  kind: string;
  name: string;
  isActive: boolean;
}
export interface CatalogSupplier {
  id: string;
  name: string;
}

export const catalogApi = {
  units: () => api.get<CatalogUnit[]>('/catalog/units'),
  categories: (kind: 'PRODUCT' | 'RECIPE' | 'EXPENSE') =>
    api.get<CatalogCategory[]>(`/catalog/categories?kind=${kind}`),
  suppliers: () => api.get<CatalogSupplier[]>('/catalog/suppliers'),
  createCategory: (input: CategoryCreateInput) =>
    api.post<CatalogCategory>('/catalog/categories', input),
  updateCategory: (id: string, input: CategoryUpdateInput) =>
    api.put<CatalogCategory>(`/catalog/categories/${id}`, input),
  deactivateCategory: (id: string) => api.post(`/catalog/categories/${id}/deactivate`),
};
