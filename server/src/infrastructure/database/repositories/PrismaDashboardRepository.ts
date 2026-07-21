import type { PrismaClient } from '@prisma/client';
import type { DashboardDay, TopIngredient, TopRecipe } from '@gaby/shared';
import type { IDashboardRepository } from '../../../domain/repositories/IDashboardRepository.js';
import { round2, round3 } from '../../../domain/services/costing.js';
import { toDateOnlyUTC } from '../../../domain/services/production.js';

/** Estados cuya producción ya tiene costo snapshot congelado (confirmada o posterior). */
const COSTED_STATUSES = [
  'CONFIRMED',
  'IN_DELIVERY',
  'DELIVERED',
  'IN_PREPARATION',
  'COMPLETED',
  'CLOSED',
] as const;

/** Clave YYYY-MM-DD de una columna @db.Date (siempre en UTC — ver toDateOnlyUTC). */
function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Agregaciones del dashboard. Los volúmenes son diminutos (un restaurante,
 * 14 días), así que se consulta lo mínimo y se consolida en memoria en vez
 * de armar SQL crudo — mismo resultado, código verificable por el compilador.
 */
export class PrismaDashboardRepository implements IDashboardRepository {
  constructor(private readonly db: PrismaClient) {}

  async dailyTotals(from: Date, to: Date): Promise<DashboardDay[]> {
    const range = { gte: toDateOnlyUTC(from), lte: toDateOnlyUTC(to) };
    const [sales, orders, expenses] = await Promise.all([
      this.db.saleRecord.findMany({
        where: { date: range },
        select: { date: true, items: { select: { total: true } } },
      }),
      this.db.productionOrder.findMany({
        where: { date: range, status: { in: [...COSTED_STATUSES] } },
        select: { date: true, items: { select: { totalCostSnapshot: true } } },
      }),
      this.db.expense.groupBy({
        by: ['date'],
        where: { date: range },
        _sum: { amount: true },
      }),
    ]);

    const days = new Map<string, DashboardDay>();
    const day = (date: Date): DashboardDay => {
      const key = dayKey(date);
      let d = days.get(key);
      if (!d) {
        d = { date: key, sales: 0, productionCost: 0, expenses: 0, profit: 0 };
        days.set(key, d);
      }
      return d;
    };

    for (const s of sales) {
      day(s.date).sales += s.items.reduce((sum, i) => sum + i.total.toNumber(), 0);
    }
    for (const o of orders) {
      day(o.date).productionCost += o.items.reduce(
        (sum, i) => sum + i.totalCostSnapshot.toNumber(),
        0,
      );
    }
    for (const e of expenses) {
      day(e.date).expenses += e._sum.amount?.toNumber() ?? 0;
    }

    return [...days.values()]
      .map((d) => ({
        ...d,
        sales: round2(d.sales),
        productionCost: round2(d.productionCost),
        expenses: round2(d.expenses),
        profit: round2(d.sales - d.productionCost - d.expenses),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async portionsOn(date: Date): Promise<number> {
    const record = await this.db.saleRecord.findUnique({
      where: { date: toDateOnlyUTC(date) },
      select: { items: { select: { portions: true } } },
    });
    return record?.items.reduce((sum, i) => sum + i.portions, 0) ?? 0;
  }

  async topRecipes(from: Date, to: Date, limit: number): Promise<TopRecipe[]> {
    const items = await this.db.saleItem.findMany({
      where: { saleRecord: { date: { gte: toDateOnlyUTC(from), lte: toDateOnlyUTC(to) } } },
      select: { portions: true, total: true, recipe: { select: { id: true, name: true } } },
    });
    const byRecipe = new Map<string, TopRecipe>();
    for (const i of items) {
      const entry = byRecipe.get(i.recipe.id) ?? {
        recipeId: i.recipe.id,
        name: i.recipe.name,
        portions: 0,
        total: 0,
      };
      entry.portions += i.portions;
      entry.total = round2(entry.total + i.total.toNumber());
      byRecipe.set(i.recipe.id, entry);
    }
    return [...byRecipe.values()].sort((a, b) => b.portions - a.portions).slice(0, limit);
  }

  async topIngredients(from: Date, to: Date, limit: number): Promise<TopIngredient[]> {
    const requirements = await this.db.productionRequirement.findMany({
      where: {
        order: {
          date: { gte: toDateOnlyUTC(from), lte: toDateOnlyUTC(to) },
          status: { in: [...COSTED_STATUSES] },
        },
      },
      select: {
        requiredQuantity: true,
        product: {
          select: { id: true, name: true, avgCost: true, unit: { select: { abbreviation: true } } },
        },
      },
    });
    const byProduct = new Map<string, TopIngredient>();
    for (const r of requirements) {
      const entry = byProduct.get(r.product.id) ?? {
        productId: r.product.id,
        name: r.product.name,
        quantity: 0,
        unit: r.product.unit.abbreviation,
        estimatedCost: 0,
      };
      entry.quantity = round3(entry.quantity + r.requiredQuantity.toNumber());
      entry.estimatedCost = round2(entry.quantity * r.product.avgCost.toNumber());
      byProduct.set(r.product.id, entry);
    }
    return [...byProduct.values()].sort((a, b) => b.estimatedCost - a.estimatedCost).slice(0, limit);
  }
}
