import type { RecipeIngredientInput } from '@gaby/shared';
import type { CatalogUnit, Product } from '@/features/inventory/api';

/**
 * Estimación de costo EN VIVO del editor (espejo del cálculo del backend:
 * domain/services/costing.ts). El valor final siempre lo fija el servidor.
 */
export function estimateRecipeCost(
  ingredients: Partial<RecipeIngredientInput>[],
  yieldPortions: number,
  targetMarginPct: number,
  products: Product[] | undefined,
  units: CatalogUnit[] | undefined,
) {
  let total = 0;
  for (const ing of ingredients) {
    if (!ing.productId || !ing.unitId || !ing.quantity) continue;
    const product = products?.find((p) => p.id === ing.productId);
    const unit = units?.find((u) => u.id === ing.unitId);
    if (!product || !unit) continue;
    total += Number(ing.quantity) * unit.factorToBase * product.avgCost;
  }
  const perPortion = yieldPortions > 0 ? total / yieldPortions : 0;
  const margin = Math.min(Math.max(targetMarginPct, 0), 95) / 100;
  const price = perPortion > 0 ? Math.ceil(perPortion / (1 - margin) / 100) * 100 : 0;
  return { total, perPortion, price };
}

/** Convierte el textarea de pasos (uno por línea) al array del esquema. */
export function parseSteps(text: string): string[] {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length >= 3);
}
