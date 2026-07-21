import { describe, expect, it } from 'vitest';
import { planFefoConsumption, type ConsumableBatch } from './fefo.js';

const day = (offset: number): Date => new Date(Date.now() + offset * 24 * 3600 * 1000);

describe('planFefoConsumption', () => {
  it('consume primero el lote que vence antes', () => {
    const batches: ConsumableBatch[] = [
      { id: 'lejano', remainingQuantity: 10, expiryDate: day(30) },
      { id: 'cercano', remainingQuantity: 10, expiryDate: day(5) },
    ];
    const plan = planFefoConsumption(batches, 4);
    expect(plan.consumptions).toEqual([{ batchId: 'cercano', quantity: 4 }]);
    expect(plan.unbatchedQuantity).toBe(0);
  });

  it('los lotes sin fecha de vencimiento van al final', () => {
    const batches: ConsumableBatch[] = [
      { id: 'sin-fecha', remainingQuantity: 10, expiryDate: null },
      { id: 'con-fecha', remainingQuantity: 3, expiryDate: day(10) },
    ];
    const plan = planFefoConsumption(batches, 5);
    expect(plan.consumptions).toEqual([
      { batchId: 'con-fecha', quantity: 3 },
      { batchId: 'sin-fecha', quantity: 2 },
    ]);
  });

  it('avanza al siguiente lote cuando el primero no alcanza', () => {
    const batches: ConsumableBatch[] = [
      { id: 'A', remainingQuantity: 2, expiryDate: day(1) },
      { id: 'B', remainingQuantity: 10, expiryDate: day(2) },
    ];
    const plan = planFefoConsumption(batches, 5);
    expect(plan.consumptions).toEqual([
      { batchId: 'A', quantity: 2 },
      { batchId: 'B', quantity: 3 },
    ]);
    expect(plan.unbatchedQuantity).toBe(0);
  });

  it('si los lotes no cubren la cantidad, el resto queda sin lote', () => {
    const batches: ConsumableBatch[] = [{ id: 'A', remainingQuantity: 2, expiryDate: day(1) }];
    const plan = planFefoConsumption(batches, 5);
    expect(plan.consumptions).toEqual([{ batchId: 'A', quantity: 2 }]);
    expect(plan.unbatchedQuantity).toBe(3);
  });

  it('ignora lotes con remainingQuantity en cero o negativa', () => {
    const batches: ConsumableBatch[] = [
      { id: 'vacio', remainingQuantity: 0, expiryDate: day(1) },
      { id: 'con-stock', remainingQuantity: 5, expiryDate: day(2) },
    ];
    const plan = planFefoConsumption(batches, 3);
    expect(plan.consumptions).toEqual([{ batchId: 'con-stock', quantity: 3 }]);
  });

  it('cantidad cero no consume nada', () => {
    const batches: ConsumableBatch[] = [{ id: 'A', remainingQuantity: 5, expiryDate: null }];
    const plan = planFefoConsumption(batches, 0);
    expect(plan.consumptions).toEqual([]);
    expect(plan.unbatchedQuantity).toBe(0);
  });
});
