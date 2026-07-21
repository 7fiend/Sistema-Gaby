import { ERROR_CODES, PRODUCTION_TRANSITIONS, type ProductionStatus } from '@gaby/shared';
import { BusinessRuleError } from '../errors/AppError.js';
import { round3 } from './costing.js';

/**
 * Servicios de producción (dominio puro): explosión consolidada de
 * ingredientes (RF-04.2) y validación de la máquina de estados (RF-04.5).
 */

/** Valida una transición contra el mapa compartido; lanza INVALID_TRANSITION. */
export function assertTransition(from: ProductionStatus, to: ProductionStatus): void {
  if (!PRODUCTION_TRANSITIONS[from].includes(to)) {
    throw new BusinessRuleError(
      ERROR_CODES.INVALID_TRANSITION,
      `Transición inválida: ${from} → ${to}`,
      { from, to, allowed: PRODUCTION_TRANSITIONS[from] },
    );
  }
}

export interface ExplosionIngredient {
  productId: string;
  /** Cantidad por lote de rendimiento, en la unidad de la receta. */
  quantity: number;
  /** Factor de conversión de esa unidad a la unidad base del producto. */
  factorToBase: number;
}

export interface ExplosionItem {
  portions: number;
  /** Rendimiento del lote de la receta (las cantidades son por lote). */
  yieldPortions: number;
  ingredients: ExplosionIngredient[];
}

/**
 * Explosión consolidada: escala cada receta a sus porciones, convierte a
 * unidad base y SUMA los ingredientes compartidos entre recetas.
 * Devuelve productId → cantidad requerida (unidad base, redondeo a gramo).
 */
export function explodeRequirements(items: ExplosionItem[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const item of items) {
    const scale = item.portions / item.yieldPortions;
    for (const ing of item.ingredients) {
      const qtyBase = ing.quantity * ing.factorToBase * scale;
      totals.set(ing.productId, (totals.get(ing.productId) ?? 0) + qtyBase);
    }
  }
  for (const [productId, qty] of totals) totals.set(productId, round3(qty));
  return totals;
}

/**
 * Normaliza a fecha pura en UTC (columnas @db.Date: producción, ventas,
 * gastos). Evita el corrimiento de día al formatear en América/Bogotá.
 */
export function toDateOnlyUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
