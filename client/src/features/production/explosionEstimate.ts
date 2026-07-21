import type { ProductionItemInput } from '@gaby/shared';
import type { CatalogUnit, Product } from '@/features/inventory/api';
import type { RecipeDetail } from '@/features/recipes/api';
import type { AvailabilityLine } from './api';

/**
 * Explosión consolidada EN VIVO para la creación de órdenes (espejo de
 * domain/services/production.ts). El servidor materializa la definitiva
 * al confirmar; esta solo advierte faltantes con los datos ya cargados.
 */
export function estimateExplosion(
  items: Partial<ProductionItemInput>[],
  recipeDetails: (RecipeDetail | undefined)[],
  products: Product[] | undefined,
  units: CatalogUnit[] | undefined,
): AvailabilityLine[] {
  const totals = new Map<string, { name: string; code: string; unit: string; required: number }>();

  items.forEach((item, idx) => {
    const recipe = recipeDetails[idx];
    const portions = Number(item.portions) || 0;
    if (!item.recipeId || !recipe || portions <= 0 || recipe.yieldPortions <= 0) return;
    const scale = portions / recipe.yieldPortions;
    for (const ing of recipe.ingredients) {
      const factor = units?.find((u) => u.id === ing.unit.id)?.factorToBase ?? 1;
      const product = products?.find((p) => p.id === ing.productId);
      const prev = totals.get(ing.productId);
      totals.set(ing.productId, {
        name: ing.productName,
        code: ing.productCode,
        unit: product?.unit.abbreviation ?? ing.unit.abbreviation,
        required: (prev?.required ?? 0) + ing.quantity * factor * scale,
      });
    }
  });

  return [...totals]
    .map(([productId, t]) => {
      const available = products?.find((p) => p.id === productId)?.currentStock ?? 0;
      const required = Math.round(t.required * 1000) / 1000;
      return {
        productId,
        productName: t.name,
        productCode: t.code,
        unitAbbreviation: t.unit,
        required,
        available,
        missing: Math.round(Math.max(0, required - available) * 1000) / 1000,
      };
    })
    .sort((a, b) => a.productName.localeCompare(b.productName));
}
