/** Fila cruda de agregación por orden+receta (reporte de producción). */
export interface ProductionSummaryRow {
  orderNumber: string;
  date: Date;
  recipeName: string;
  portions: number;
  totalCostSnapshot: number;
}

/** Fila cruda de gastos agregados por categoría. */
export interface ExpenseCategoryRow {
  categoryName: string;
  count: number;
  totalAmount: number;
}

/** Fila cruda de inventario valorizado. */
export interface InventoryValueRow {
  code: string;
  name: string;
  categoryName: string;
  currentStock: number;
  avgCost: number;
  totalValue: number;
}

/** Fila cruda de desperdicio: producción (teórico vs real) o movimiento de inventario. */
export interface WasteRow {
  source: 'production' | 'inventory';
  productName: string;
  unitAbbreviation: string;
  requiredQuantity: number | null;
  deliveredQuantity: number | null;
  movementQuantity: number | null;
  movementValue: number | null;
}

/** Fila cruda de rentabilidad por receta (ventas vs. costo snapshot de producción). */
export interface RecipeProfitabilityRow {
  recipeId: string;
  recipeName: string;
  salesTotal: number;
  productionCost: number;
}

/**
 * Agregaciones de solo lectura para Reportes (RF-12), análogo a
 * `IDashboardRepository`: consulta varias tablas directamente (mismo
 * precedente de `PrismaDashboardRepository`) sin pasar por los repositorios
 * de cada agregado, porque las formas de agregación son específicas de cada
 * reporte y no coinciden con las de los repos de dominio existentes.
 */
export interface IReportsRepository {
  productionSummary(from: Date, to: Date): Promise<ProductionSummaryRow[]>;
  expensesByCategory(from: Date, to: Date): Promise<ExpenseCategoryRow[]>;
  /** Foto del momento actual — el rango de fechas no aplica (sin snapshots históricos de stock). */
  inventoryValue(): Promise<InventoryValueRow[]>;
  wasteReport(from: Date, to: Date): Promise<WasteRow[]>;
  recipeProfitability(from: Date, to: Date): Promise<RecipeProfitabilityRow[]>;
}
