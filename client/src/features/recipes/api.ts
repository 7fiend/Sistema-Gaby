import type {
  Paginated,
  RecipeCreateInput,
  RecipeReviseInput,
  RecipeUpdateInput,
} from '@gaby/shared';
import { api } from '@/lib/api';

export interface Recipe {
  id: string;
  name: string;
  category: { id: string; name: string };
  imageUrl: string | null;
  prepTimeMinutes: number;
  yieldPortions: number;
  targetMarginPct: number;
  currentCost: number;
  costPerPortion: number;
  suggestedPrice: number;
  sellingPrice: number | null;
  isActive: boolean;
  currentVersionNumber: number;
}

export interface RecipeIngredient {
  productId: string;
  productName: string;
  productCode: string;
  quantity: number;
  unit: { id: string; abbreviation: string };
  currentCost: number;
}

export interface RecipeDetail extends Recipe {
  description: string | null;
  ingredients: RecipeIngredient[];
  steps: string[];
  notes: string | null;
  versions: { versionNumber: number; createdAt: string; createdBy: string; isCurrent: boolean }[];
}

function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

export const recipesApi = {
  list: (params: { page: number; pageSize?: number; search?: string; categoryId?: string }) =>
    api.get<Paginated<Recipe>>(`/recipes${qs(params)}`),
  get: (id: string) => api.get<RecipeDetail>(`/recipes/${id}`),
  create: (input: RecipeCreateInput) => api.post<RecipeDetail>('/recipes', input),
  update: (id: string, input: RecipeUpdateInput) => api.put<RecipeDetail>(`/recipes/${id}`, input),
  revise: (id: string, input: RecipeReviseInput) =>
    api.post<RecipeDetail>(`/recipes/${id}/revise`, input),
  deactivate: (id: string) => api.post(`/recipes/${id}/deactivate`),
};
