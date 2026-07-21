import { round3 } from './costing.js';

/** Lote disponible para consumo (dominio puro). */
export interface ConsumableBatch {
  id: string;
  remainingQuantity: number;
  expiryDate: Date | null;
}

export interface BatchConsumption {
  batchId: string;
  quantity: number;
}

export interface FefoPlan {
  consumptions: BatchConsumption[];
  /** Cantidad que no alcanzó a cubrirse con lotes (se descuenta sin lote). */
  unbatchedQuantity: number;
}

/**
 * FEFO (RN-05): consume primero el lote que vence antes; los lotes sin
 * vencimiento van al final. Si los lotes no cubren la cantidad (histórico
 * sin lote), el resto se registra como consumo sin lote — el stock del
 * producto es la fuente de verdad y se valida aparte.
 */
export function planFefoConsumption(batches: ConsumableBatch[], quantity: number): FefoPlan {
  const sorted = [...batches]
    .filter((b) => b.remainingQuantity > 0)
    .sort((a, b) => {
      if (a.expiryDate === null && b.expiryDate === null) return 0;
      if (a.expiryDate === null) return 1;
      if (b.expiryDate === null) return -1;
      return a.expiryDate.getTime() - b.expiryDate.getTime();
    });

  const consumptions: BatchConsumption[] = [];
  let pending = quantity;

  for (const batch of sorted) {
    if (pending <= 0) break;
    const take = round3(Math.min(batch.remainingQuantity, pending));
    consumptions.push({ batchId: batch.id, quantity: take });
    pending = round3(pending - take);
  }

  return { consumptions, unbatchedQuantity: Math.max(pending, 0) };
}
