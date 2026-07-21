import type { PrismaClient } from '@prisma/client';
import type {
  ExpenseCategoryRow,
  InventoryValueRow,
  IReportsRepository,
  ProductionSummaryRow,
  RecipeProfitabilityRow,
  WasteRow,
} from '../../../domain/repositories/IReportsRepository.js';
import { round2, round3 } from '../../../domain/services/costing.js';
import { toDateOnlyUTC } from '../../../domain/services/production.js';

/** Estados cuya producción ya tiene costo snapshot congelado (mismo filtro que el dashboard). */
const COSTED_STATUSES = [
  'CONFIRMED',
  'IN_DELIVERY',
  'DELIVERED',
  'IN_PREPARATION',
  'COMPLETED',
  'CLOSED',
] as const;

/** Fin del día en UTC — `stockMovement.createdAt` es DateTime completo, no `@db.Date`. */
function endOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

/**
 * Agregaciones de solo lectura para Reportes (RF-12). Mismo estilo que
 * `PrismaDashboardRepository`: consulta varias tablas directamente y
 * consolida en memoria (volúmenes pequeños, un restaurante).
 */
export class PrismaReportsRepository implements IReportsRepository {
  constructor(private readonly db: PrismaClient) {}

  async productionSummary(from: Date, to: Date): Promise<ProductionSummaryRow[]> {
    const range = { gte: toDateOnlyUTC(from), lte: toDateOnlyUTC(to) };
    const items = await this.db.productionOrderItem.findMany({
      where: { order: { date: range, status: { in: [...COSTED_STATUSES] } } },
      include: { order: { select: { orderNumber: true, date: true } }, recipe: { select: { name: true } } },
      orderBy: { order: { date: 'asc' } },
    });
    return items.map((i) => ({
      orderNumber: i.order.orderNumber,
      date: i.order.date,
      recipeName: i.recipe.name,
      portions: i.portions,
      totalCostSnapshot: i.totalCostSnapshot.toNumber(),
    }));
  }

  async expensesByCategory(from: Date, to: Date): Promise<ExpenseCategoryRow[]> {
    const range = { gte: toDateOnlyUTC(from), lte: toDateOnlyUTC(to) };
    const grouped = await this.db.expense.groupBy({
      by: ['categoryId'],
      where: { date: range },
      _sum: { amount: true },
      _count: true,
    });
    const categories = await this.db.category.findMany({
      where: { id: { in: grouped.map((g) => g.categoryId) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(categories.map((c) => [c.id, c.name]));
    return grouped
      .map((g) => ({
        categoryName: nameById.get(g.categoryId) ?? g.categoryId,
        count: g._count,
        totalAmount: round2(g._sum.amount?.toNumber() ?? 0),
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);
  }

  async inventoryValue(): Promise<InventoryValueRow[]> {
    const products = await this.db.product.findMany({
      where: { isActive: true },
      select: {
        code: true,
        name: true,
        currentStock: true,
        avgCost: true,
        category: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    });
    return products.map((p) => {
      const currentStock = p.currentStock.toNumber();
      const avgCost = p.avgCost.toNumber();
      return {
        code: p.code,
        name: p.name,
        categoryName: p.category.name,
        currentStock,
        avgCost,
        totalValue: round2(currentStock * avgCost),
      };
    });
  }

  async wasteReport(from: Date, to: Date): Promise<WasteRow[]> {
    const range = { gte: toDateOnlyUTC(from), lte: toDateOnlyUTC(to) };
    const [requirements, movements] = await Promise.all([
      this.db.productionRequirement.findMany({
        where: { order: { date: range, status: { in: [...COSTED_STATUSES] } } },
        select: {
          requiredQuantity: true,
          deliveredQuantity: true,
          product: { select: { name: true, unit: { select: { abbreviation: true } } } },
        },
      }),
      this.db.stockMovement.findMany({
        where: { type: { in: ['WASTE', 'LOSS', 'EXPIRY'] }, createdAt: { gte: toDateOnlyUTC(from), lte: endOfDayUTC(to) } },
        select: {
          quantity: true,
          totalCost: true,
          product: { select: { name: true, unit: { select: { abbreviation: true } } } },
        },
      }),
    ]);

    const production = new Map<string, WasteRow>();
    for (const r of requirements) {
      const key = r.product.name;
      const row = production.get(key) ?? {
        source: 'production' as const,
        productName: r.product.name,
        unitAbbreviation: r.product.unit.abbreviation,
        requiredQuantity: 0,
        deliveredQuantity: 0,
        movementQuantity: null,
        movementValue: null,
      };
      row.requiredQuantity = round3((row.requiredQuantity ?? 0) + r.requiredQuantity.toNumber());
      row.deliveredQuantity = round3((row.deliveredQuantity ?? 0) + r.deliveredQuantity.toNumber());
      production.set(key, row);
    }

    const inventory = new Map<string, WasteRow>();
    for (const m of movements) {
      const key = m.product.name;
      const row = inventory.get(key) ?? {
        source: 'inventory' as const,
        productName: m.product.name,
        unitAbbreviation: m.product.unit.abbreviation,
        requiredQuantity: null,
        deliveredQuantity: null,
        movementQuantity: 0,
        movementValue: 0,
      };
      row.movementQuantity = round3((row.movementQuantity ?? 0) + m.quantity.toNumber());
      row.movementValue = round2((row.movementValue ?? 0) + m.totalCost.toNumber());
      inventory.set(key, row);
    }

    return [...production.values(), ...inventory.values()];
  }

  async recipeProfitability(from: Date, to: Date): Promise<RecipeProfitabilityRow[]> {
    const range = { gte: toDateOnlyUTC(from), lte: toDateOnlyUTC(to) };
    const [saleItems, orderItems] = await Promise.all([
      this.db.saleItem.findMany({
        where: { saleRecord: { date: range } },
        select: { total: true, recipe: { select: { id: true, name: true } } },
      }),
      this.db.productionOrderItem.findMany({
        where: { order: { date: range, status: { in: [...COSTED_STATUSES] } } },
        select: { totalCostSnapshot: true, recipe: { select: { id: true, name: true } } },
      }),
    ]);

    const byRecipe = new Map<string, RecipeProfitabilityRow>();
    const entry = (id: string, name: string) => {
      let e = byRecipe.get(id);
      if (!e) {
        e = { recipeId: id, recipeName: name, salesTotal: 0, productionCost: 0 };
        byRecipe.set(id, e);
      }
      return e;
    };
    for (const s of saleItems) {
      entry(s.recipe.id, s.recipe.name).salesTotal += s.total.toNumber();
    }
    for (const o of orderItems) {
      entry(o.recipe.id, o.recipe.name).productionCost += o.totalCostSnapshot.toNumber();
    }
    return [...byRecipe.values()].map((r) => ({
      ...r,
      salesTotal: round2(r.salesTotal),
      productionCost: round2(r.productionCost),
    }));
  }
}
