import { z } from 'zod';

/**
 * Dashboard (entrega 9c): el cliente envía SU fecha local (YYYY-MM-DD) para
 * que "hoy" no dependa de la zona horaria del servidor (columnas @db.Date).
 */
export const dashboardQuerySchema = z.object({ date: z.coerce.date() });
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

export const alertsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type AlertsQuery = z.infer<typeof alertsQuerySchema>;

/** Días que cubren las series y los tops del dashboard (incluye hoy). */
export const DASHBOARD_RANGE_DAYS = 14;

export interface DashboardKpis {
  /** Ventas del día (suma de sale_items.total). */
  salesToday: number;
  salesYesterday: number;
  /** Costo snapshot de producción confirmada del día (RN-03: nunca recalculado). */
  productionCostToday: number;
  productionCostYesterday: number;
  expensesToday: number;
  expensesYesterday: number;
  /** Utilidad = ventas − costo producción − gastos. */
  profitToday: number;
  profitYesterday: number;
  portionsToday: number;
}

/** Punto diario de las series (date = YYYY-MM-DD). */
export interface DashboardDay {
  date: string;
  sales: number;
  productionCost: number;
  expenses: number;
  profit: number;
}

export interface TopRecipe {
  recipeId: string;
  name: string;
  portions: number;
  total: number;
}

export interface TopIngredient {
  productId: string;
  name: string;
  /** Cantidad requerida acumulada en unidad base del producto. */
  quantity: number;
  unit: string;
  /** Costo estimado con el promedio ponderado vigente (informativo). */
  estimatedCost: number;
}

export interface DashboardSummary {
  kpis: DashboardKpis;
  days: DashboardDay[];
  topRecipes: TopRecipe[];
  topIngredients: TopIngredient[];
}
