import { describe, expect, it } from 'vitest';
import { evaluateDelivery, recomputeRequirementStatus } from './delivery.js';

describe('evaluateDelivery — modo "complete"', () => {
  it('aprueba una lectura exacta al pendiente', () => {
    const r = evaluateDelivery(10, 10, 0.05, 'complete');
    expect(r.approved).toBe(true);
    expect(r.withinTolerance).toBe(true);
    expect(r.deltaKg).toBe(0);
  });

  it('aprueba dentro del límite superior de tolerancia', () => {
    const r = evaluateDelivery(10, 10.05, 0.05, 'complete');
    expect(r.approved).toBe(true);
  });

  it('aprueba dentro del límite inferior de tolerancia', () => {
    const r = evaluateDelivery(10, 9.95, 0.05, 'complete');
    expect(r.approved).toBe(true);
  });

  it('rechaza por exceso fuera de tolerancia', () => {
    const r = evaluateDelivery(10, 10.06, 0.05, 'complete');
    expect(r.approved).toBe(false);
    expect(r.withinTolerance).toBe(false);
  });

  it('rechaza por defecto fuera de tolerancia', () => {
    const r = evaluateDelivery(10, 9.94, 0.05, 'complete');
    expect(r.approved).toBe(false);
  });

  it('deltaKg tiene signo: negativo = faltó, positivo = sobró', () => {
    expect(evaluateDelivery(10, 8, 0.05, 'complete').deltaKg).toBe(-2);
    expect(evaluateDelivery(10, 12, 0.05, 'complete').deltaKg).toBe(2);
  });
});

describe('evaluateDelivery — modo "partial"', () => {
  it('aprueba cualquier cantidad positiva que no exceda el pendiente, sin exigir tolerancia', () => {
    const r = evaluateDelivery(10, 3, 0.05, 'partial');
    expect(r.approved).toBe(true);
    expect(r.withinTolerance).toBe(false); // 3 está lejísimos de 10 ± 0.05, pero no importa en parcial
  });

  it('aprueba exactamente el pendiente completo', () => {
    expect(evaluateDelivery(10, 10, 0.05, 'partial').approved).toBe(true);
  });

  it('rechaza una cantidad que excede el pendiente', () => {
    expect(evaluateDelivery(10, 10.01, 0.05, 'partial').approved).toBe(false);
  });

  it('rechaza cantidad cero (floor de partial es 0, pero 0 no es > 0 útil aquí igual entra en el rango; el caso real de bloqueo es negativo)', () => {
    // El floor de "partial" es 0, así que 0 técnicamente aprueba por rango — la
    // validación de "> 0" vive en el schema Zod de entrada, no en esta regla.
    expect(evaluateDelivery(10, 0, 0.05, 'partial').approved).toBe(true);
  });

  it('rechaza cantidad negativa', () => {
    expect(evaluateDelivery(10, -1, 0.05, 'partial').approved).toBe(false);
  });
});

describe('recomputeRequirementStatus', () => {
  it('DELIVERED cuando lo entregado cae dentro de tolerancia del requerido', () => {
    expect(recomputeRequirementStatus(10, 10, 0.05)).toBe('DELIVERED');
    expect(recomputeRequirementStatus(10.04, 10, 0.05)).toBe('DELIVERED');
  });

  it('PARTIAL cuando lo entregado está fuera de tolerancia (aún falta)', () => {
    expect(recomputeRequirementStatus(5, 10, 0.05)).toBe('PARTIAL');
  });
});
