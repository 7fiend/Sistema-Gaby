import type { RequirementStatus } from '@gaby/shared';
import { round3 } from './costing.js';

/**
 * Regla de tolerancia de entregas (RF-05.3/RF-05.4/RN-04), dominio puro.
 *
 * pending = requiredQuantity − deliveredQuantity (lo que falta del requirement).
 *
 * - Modo `complete` (botón principal): aprueba si la lectura cae dentro de
 *   ±toleranceApplied del pendiente (por exceso o por defecto bloquea).
 * - Modo `partial` (acción secundaria, RF-05.4): aprueba cualquier cantidad
 *   positiva que NO exceda el pendiente, sin exigir tolerancia — así se
 *   pueden acumular varias pesadas hasta completar lo requerido.
 */
export interface DeliveryEvaluation {
  approved: boolean;
  withinTolerance: boolean;
  /** quantity − pending, con signo: negativo = "faltan", positivo = "sobran". */
  deltaKg: number;
}

export function evaluateDelivery(
  pending: number,
  quantity: number,
  toleranceApplied: number,
  mode: 'complete' | 'partial',
): DeliveryEvaluation {
  const floor = mode === 'complete' ? pending - toleranceApplied : 0;
  const limit = mode === 'complete' ? pending + toleranceApplied : pending;
  const approved = quantity >= floor && quantity <= limit;
  const withinTolerance = Math.abs(quantity - pending) <= toleranceApplied;
  return { approved, withinTolerance, deltaKg: round3(quantity - pending) };
}

/** Estado resultante del requirement tras una entrega aprobada. */
export function recomputeRequirementStatus(
  deliveredQuantity: number,
  requiredQuantity: number,
  toleranceApplied: number,
): RequirementStatus {
  return Math.abs(deliveredQuantity - requiredQuantity) <= toleranceApplied
    ? 'DELIVERED'
    : 'PARTIAL';
}
