/**
 * Servicios de costeo (dominio puro, sin dependencias).
 * Método: promedio ponderado móvil (RF-08.2, decisión del cliente).
 * Todos los montos se manejan como number con redondeo explícito al final;
 * las cantidades del sistema tienen resolución de gramo (3 decimales).
 */

/** Nuevo costo promedio tras una entrada. */
export function weightedAverageCost(
  currentStock: number,
  currentAvgCost: number,
  entryQty: number,
  entryUnitCost: number,
): number {
  const totalQty = currentStock + entryQty;
  if (totalQty <= 0) return entryUnitCost;
  const value = currentStock * currentAvgCost + entryQty * entryUnitCost;
  return round4(value / totalQty);
}

export interface CostedIngredient {
  /** Cantidad convertida a la unidad base del producto. */
  quantityInBase: number;
  avgCost: number;
}

/** Costo del lote de rendimiento de una receta. */
export function recipeTotalCost(ingredients: CostedIngredient[]): number {
  return round2(ingredients.reduce((sum, i) => sum + i.quantityInBase * i.avgCost, 0));
}

export function costPerPortion(totalCost: number, yieldPortions: number): number {
  return yieldPortions > 0 ? round2(totalCost / yieldPortions) : 0;
}

/**
 * Precio sugerido por porción para alcanzar el margen objetivo,
 * redondeado hacia arriba a la centena (precios "de carta" en COP).
 * margen = (precio − costo) / precio  →  precio = costo / (1 − margen)
 */
export function suggestedPrice(costPortion: number, targetMarginPct: number): number {
  const margin = Math.min(Math.max(targetMarginPct, 0), 95) / 100;
  const raw = costPortion / (1 - margin);
  return Math.ceil(raw / 100) * 100;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
export function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10_000) / 10_000;
}
export function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1_000) / 1_000;
}
