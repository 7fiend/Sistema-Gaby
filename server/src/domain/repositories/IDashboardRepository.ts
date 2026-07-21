import type { DashboardDay, TopIngredient, TopRecipe } from '@gaby/shared';

/**
 * Agregaciones de solo lectura para el dashboard (entrega 9c).
 * Devuelve únicamente los días CON datos; el caso de uso rellena los vacíos.
 */
export interface IDashboardRepository {
  /** Totales por día (ventas, costo snapshot de producción, gastos) en el rango. */
  dailyTotals(from: Date, to: Date): Promise<DashboardDay[]>;
  /** Porciones vendidas en una fecha exacta. */
  portionsOn(date: Date): Promise<number>;
  topRecipes(from: Date, to: Date, limit: number): Promise<TopRecipe[]>;
  topIngredients(from: Date, to: Date, limit: number): Promise<TopIngredient[]>;
}
