import { z } from 'zod';

/**
 * `date` opcional a propósito: el kiosco de cocina siempre muestra "el día
 * del restaurante" según el SERVIDOR, no la fecha local de la tablet.
 */
export const kitchenSummaryQuerySchema = z.object({
  date: z.coerce.date().optional(),
});
export type KitchenSummaryQuery = z.infer<typeof kitchenSummaryQuerySchema>;

export interface KitchenIngredientLine {
  productName: string;
  quantity: number;
  unitAbbreviation: string;
}

export interface KitchenRecipeCard {
  recipeId: string;
  recipeName: string;
  imageUrl: string | null;
  /** Suma de porciones de hoy para esa receta (entre las órdenes activas del día). */
  totalPortions: number;
  /** 0-100: ver docs/11-modulo-cocina.md — aproximación ponderada, no exacta por receta. */
  deliveredPct: number;
  /** Ya escalados a `totalPortions` con la versión vigente de la receta. */
  ingredients: KitchenIngredientLine[];
  steps: string[];
  notes: string | null;
}

export interface KitchenSummary {
  date: string;
  recipes: KitchenRecipeCard[];
}
