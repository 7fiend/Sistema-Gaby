import { describe, expect, it } from 'vitest';
import {
  costPerPortion,
  recipeTotalCost,
  round2,
  round3,
  round4,
  suggestedPrice,
  weightedAverageCost,
} from './costing.js';

describe('weightedAverageCost', () => {
  it('pondera el stock existente y la entrada nueva', () => {
    // 10 kg a 2000 + 20 kg a 2600 = 60000 / 30 = 2000... verificado a mano:
    // (10*2000 + 20*2600) / 30 = (20000+52000)/30 = 72000/30 = 2400
    expect(weightedAverageCost(10, 2000, 20, 2600)).toBe(2400);
  });

  it('con stock inicial en cero, el promedio es el costo de la entrada', () => {
    expect(weightedAverageCost(0, 0, 5, 1500)).toBe(1500);
  });

  it('con stock total resultante <= 0 (caso degenerado), devuelve el costo de la entrada', () => {
    expect(weightedAverageCost(0, 0, 0, 1500)).toBe(1500);
  });

  it('redondea a 4 decimales', () => {
    const result = weightedAverageCost(3, 1000, 7, 1000.12345);
    expect(result).toBe(round4(result));
  });
});

describe('recipeTotalCost', () => {
  it('suma cantidad × costo promedio de cada ingrediente', () => {
    const total = recipeTotalCost([
      { quantityInBase: 2, avgCost: 1000 },
      { quantityInBase: 0.5, avgCost: 4000 },
    ]);
    expect(total).toBe(4000); // 2*1000 + 0.5*4000 = 2000+2000
  });

  it('lista vacía da costo cero', () => {
    expect(recipeTotalCost([])).toBe(0);
  });
});

describe('costPerPortion', () => {
  it('divide el costo total entre las porciones de rendimiento', () => {
    expect(costPerPortion(10000, 4)).toBe(2500);
  });

  it('rendimiento cero no divide por cero (devuelve 0)', () => {
    expect(costPerPortion(10000, 0)).toBe(0);
  });
});

describe('suggestedPrice', () => {
  it('calcula el precio para el margen objetivo y redondea a la centena hacia arriba', () => {
    // costo=1000, margen=60% → 1000 / 0.4 = 2500 → ya es múltiplo de 100
    expect(suggestedPrice(1000, 60)).toBe(2500);
  });

  it('redondea hacia arriba cuando el resultado no cae en la centena exacta', () => {
    // costo=1000, margen=50% → 1000/0.5 = 2000
    // costo=333, margen=50% → 666 → redondea a 700
    expect(suggestedPrice(333, 50)).toBe(700);
  });

  it('acota el margen a un máximo de 95%', () => {
    // margen 200% se acota a 95% → 1000/0.05 = 20000
    expect(suggestedPrice(1000, 200)).toBe(20000);
  });

  it('acota el margen a un mínimo de 0%', () => {
    // margen negativo se acota a 0% → precio = costo
    expect(suggestedPrice(1500, -20)).toBe(1500);
  });
});

describe('helpers de redondeo', () => {
  it('round2 redondea a 2 decimales', () => {
    expect(round2(1.005)).toBe(1.01); // Number.EPSILON evita el error de punto flotante clásico
    expect(round2(10 / 3)).toBe(3.33);
  });

  it('round3 redondea a 3 decimales', () => {
    expect(round3(1 / 3)).toBe(0.333);
  });

  it('round4 redondea a 4 decimales', () => {
    expect(round4(1 / 3)).toBe(0.3333);
  });
});
