import { describe, expect, it } from 'vitest';
import { PRODUCTION_TRANSITIONS, type ProductionStatus } from '@gaby/shared';
import { BusinessRuleError } from '../errors/AppError.js';
import { assertTransition, explodeRequirements, toDateOnlyUTC } from './production.js';

describe('assertTransition', () => {
  it('permite todas las transiciones declaradas en PRODUCTION_TRANSITIONS', () => {
    for (const [from, allowed] of Object.entries(PRODUCTION_TRANSITIONS) as [
      ProductionStatus,
      ProductionStatus[],
    ][]) {
      for (const to of allowed) {
        expect(() => assertTransition(from, to)).not.toThrow();
      }
    }
  });

  it('rechaza una transición no declarada', () => {
    expect(() => assertTransition('DRAFT', 'COMPLETED')).toThrow(BusinessRuleError);
  });

  it('rechaza cualquier transición desde un estado terminal (CLOSED)', () => {
    expect(() => assertTransition('CLOSED', 'DRAFT')).toThrow(BusinessRuleError);
  });

  it('el error incluye las transiciones permitidas en los detalles', () => {
    expect.assertions(2);
    try {
      assertTransition('DRAFT', 'COMPLETED');
    } catch (e) {
      expect(e).toBeInstanceOf(BusinessRuleError);
      expect((e as BusinessRuleError).details).toEqual({
        from: 'DRAFT',
        to: 'COMPLETED',
        allowed: PRODUCTION_TRANSITIONS.DRAFT,
      });
    }
  });
});

describe('explodeRequirements', () => {
  it('escala un ingrediente según las porciones pedidas', () => {
    // receta rinde 4 porciones, pide 2 kg de un ingrediente por lote → 8 porciones piden 4 kg
    const totals = explodeRequirements([
      {
        portions: 8,
        yieldPortions: 4,
        ingredients: [{ productId: 'P1', quantity: 2, factorToBase: 1 }],
      },
    ]);
    expect(totals.get('P1')).toBe(4);
  });

  it('aplica el factor de conversión a la unidad base', () => {
    // 500 g por lote (factor 0.001 de g a kg), rinde 1 porción, se piden 2 porciones
    const totals = explodeRequirements([
      {
        portions: 2,
        yieldPortions: 1,
        ingredients: [{ productId: 'P1', quantity: 500, factorToBase: 0.001 }],
      },
    ]);
    expect(totals.get('P1')).toBe(1);
  });

  it('consolida (suma) el mismo ingrediente entre varias recetas', () => {
    const totals = explodeRequirements([
      { portions: 4, yieldPortions: 4, ingredients: [{ productId: 'P1', quantity: 1, factorToBase: 1 }] },
      { portions: 4, yieldPortions: 4, ingredients: [{ productId: 'P1', quantity: 2, factorToBase: 1 }] },
    ]);
    expect(totals.get('P1')).toBe(3);
  });

  it('redondea a 3 decimales (resolución de gramo)', () => {
    const totals = explodeRequirements([
      {
        portions: 1,
        yieldPortions: 3,
        ingredients: [{ productId: 'P1', quantity: 1, factorToBase: 1 }],
      },
    ]);
    expect(totals.get('P1')).toBe(0.333);
  });

  it('sin items, devuelve un mapa vacío', () => {
    expect(explodeRequirements([]).size).toBe(0);
  });
});

describe('toDateOnlyUTC', () => {
  it('trunca la hora, manteniendo año/mes/día en UTC', () => {
    const d = new Date('2026-07-11T23:45:00.000Z');
    const result = toDateOnlyUTC(d);
    expect(result.toISOString()).toBe('2026-07-11T00:00:00.000Z');
  });

  it('no corre de día aunque la fecha original esté cerca de la medianoche local', () => {
    const d = new Date(Date.UTC(2026, 0, 1, 3, 0, 0)); // 2026-01-01 03:00 UTC
    expect(toDateOnlyUTC(d).getUTCDate()).toBe(1);
  });
});
