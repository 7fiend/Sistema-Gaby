import type { Prisma, PrismaClient } from '@prisma/client';
import type {
  KitchenRecipeCard,
  KitchenSummary,
  Paginated,
  ProductionCreateInput,
  ProductionQuery,
  ProductionStatus,
} from '@gaby/shared';
import { ERROR_CODES } from '@gaby/shared';
import type {
  AvailabilityLine,
  IProductionRepository,
  ProductionDetail,
  ProductionListItem,
} from '../../../domain/repositories/IProductionRepository.js';
import { BusinessRuleError, NotFoundError, ValidationError } from '../../../domain/errors/AppError.js';
import { round2, round3 } from '../../../domain/services/costing.js';
import {
  assertTransition,
  explodeRequirements,
  toDateOnlyUTC,
  type ExplosionItem,
} from '../../../domain/services/production.js';

type Tx = Prisma.TransactionClient;

const detailInclude = {
  createdBy: { select: { fullName: true } },
  items: {
    include: {
      recipe: { select: { id: true, name: true } },
      version: { select: { versionNumber: true } },
    },
    orderBy: { recipe: { name: 'asc' } },
  },
  requirements: {
    include: {
      product: {
        select: {
          id: true,
          name: true,
          code: true,
          isWeighable: true,
          unit: { select: { abbreviation: true } },
        },
      },
    },
    orderBy: { product: { name: 'asc' } },
  },
} as const;

type OrderRow = Prisma.ProductionOrderGetPayload<{ include: typeof detailInclude }>;

/** Versión vigente de una receta con todo lo necesario para la explosión. */
const currentVersionInclude = {
  ingredients: {
    include: {
      product: {
        select: {
          id: true,
          name: true,
          code: true,
          currentStock: true,
          toleranceKg: true,
          unit: { select: { abbreviation: true } },
        },
      },
      unit: { select: { factorToBase: true } },
    },
  },
} as const;

type VersionRow = Prisma.RecipeVersionGetPayload<{ include: typeof currentVersionInclude }>;

function toDetail(o: OrderRow): ProductionDetail {
  const items = o.items.map((i) => ({
    id: i.id,
    recipeId: i.recipe.id,
    recipeName: i.recipe.name,
    versionNumber: i.version.versionNumber,
    portions: i.portions,
    costPerPortionSnapshot: i.costPerPortionSnapshot.toNumber(),
    totalCostSnapshot: i.totalCostSnapshot.toNumber(),
  }));
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    date: o.date,
    status: o.status,
    notes: o.notes,
    createdBy: o.createdBy.fullName,
    recipesCount: items.length,
    totalPortions: items.reduce((s, i) => s + i.portions, 0),
    totalCostSnapshot: round2(items.reduce((s, i) => s + i.totalCostSnapshot, 0)),
    confirmedAt: o.confirmedAt,
    createdAt: o.createdAt,
    items,
    requirements: o.requirements.map((r) => ({
      id: r.id,
      productId: r.product.id,
      productName: r.product.name,
      productCode: r.product.code,
      unitAbbreviation: r.product.unit.abbreviation,
      isWeighable: r.product.isWeighable,
      requiredQuantity: r.requiredQuantity.toNumber(),
      deliveredQuantity: r.deliveredQuantity.toNumber(),
      status: r.status,
      toleranceApplied: r.toleranceApplied.toNumber(),
    })),
  };
}

export class PrismaProductionRepository implements IProductionRepository {
  constructor(private readonly db: PrismaClient) {}

  async list(query: ProductionQuery): Promise<Paginated<ProductionListItem>> {
    const where: Prisma.ProductionOrderWhereInput = {
      ...(query.status && { status: query.status }),
      ...((query.from || query.to) && {
        date: {
          ...(query.from && { gte: toDateOnlyUTC(query.from) }),
          ...(query.to && { lte: toDateOnlyUTC(query.to) }),
        },
      }),
      ...(query.search && { orderNumber: { contains: query.search, mode: 'insensitive' } }),
    };
    const [rows, total] = await this.db.$transaction([
      this.db.productionOrder.findMany({
        where,
        include: detailInclude,
        orderBy: [{ date: 'desc' }, { orderNumber: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.productionOrder.count({ where }),
    ]);
    return {
      items: rows.map(toDetail),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async findById(id: string): Promise<ProductionDetail | null> {
    const o = await this.db.productionOrder.findUnique({ where: { id }, include: detailInclude });
    return o ? toDetail(o) : null;
  }

  /** Siguiente consecutivo "OP-<año>-####" (dentro de la transacción). */
  private async nextOrderNumber(tx: Tx): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `OP-${year}-`;
    const last = await tx.productionOrder.findFirst({
      where: { orderNumber: { startsWith: prefix } },
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true },
    });
    const next = last ? Number(last.orderNumber.slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(next).padStart(4, '0')}`;
  }

  private async currentVersionOrThrow(tx: Tx, recipeId: string): Promise<VersionRow & { recipe: { yieldPortions: number; costPerPortion: Prisma.Decimal; name: string; isActive: boolean } }> {
    const version = await tx.recipeVersion.findFirst({
      where: { recipeId, isCurrent: true },
      include: {
        ...currentVersionInclude,
        recipe: { select: { yieldPortions: true, costPerPortion: true, name: true, isActive: true } },
      },
    });
    if (!version) throw new NotFoundError('Receta', recipeId);
    return version;
  }

  async create(input: ProductionCreateInput, userId: string): Promise<ProductionDetail> {
    const id = await this.db.$transaction(async (tx) => {
      // valida recetas y captura la versión vigente al momento de crear
      const versions = new Map<string, VersionRow>();
      for (const item of input.items) {
        const v = await this.currentVersionOrThrow(tx, item.recipeId);
        if (!v.recipe.isActive) {
          throw new ValidationError(`La receta "${v.recipe.name}" está desactivada`);
        }
        versions.set(item.recipeId, v);
      }
      const order = await tx.productionOrder.create({
        data: {
          orderNumber: await this.nextOrderNumber(tx),
          date: toDateOnlyUTC(input.date),
          notes: input.notes ?? null,
          createdById: userId,
          items: {
            create: input.items.map((i) => ({
              recipeId: i.recipeId,
              recipeVersionId: versions.get(i.recipeId)!.id,
              portions: i.portions,
            })),
          },
        },
      });
      return order.id;
    });
    return (await this.findById(id))!;
  }

  /** Explosión (sin mutar) de una orden con las versiones vigentes. */
  private async explodeDraft(tx: Tx, orderId: string): Promise<AvailabilityLine[]> {
    const items = await tx.productionOrderItem.findMany({ where: { orderId } });
    const products = new Map<
      string,
      { name: string; code: string; unit: string; stock: number }
    >();
    const explosion: ExplosionItem[] = [];
    for (const item of items) {
      const v = await this.currentVersionOrThrow(tx, item.recipeId);
      explosion.push({
        portions: item.portions,
        yieldPortions: v.recipe.yieldPortions,
        ingredients: v.ingredients.map((ing) => {
          products.set(ing.product.id, {
            name: ing.product.name,
            code: ing.product.code,
            unit: ing.product.unit.abbreviation,
            stock: ing.product.currentStock.toNumber(),
          });
          return {
            productId: ing.product.id,
            quantity: ing.quantity.toNumber(),
            factorToBase: ing.unit.factorToBase.toNumber(),
          };
        }),
      });
    }
    return [...explodeRequirements(explosion)].map(([productId, required]) => {
      const p = products.get(productId)!;
      return {
        productId,
        productName: p.name,
        productCode: p.code,
        unitAbbreviation: p.unit,
        required,
        available: p.stock,
        missing: round3(Math.max(0, required - p.stock)),
      };
    });
  }

  async availability(id: string): Promise<AvailabilityLine[]> {
    const order = await this.db.productionOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundError('Orden de producción', id);

    if (order.status === 'DRAFT') {
      return this.db.$transaction((tx) => this.explodeDraft(tx, id));
    }
    // Ya confirmada: lo pendiente por entregar vs stock actual
    const reqs = await this.db.productionRequirement.findMany({
      where: { orderId: id },
      include: {
        product: {
          select: { id: true, name: true, code: true, currentStock: true, unit: { select: { abbreviation: true } } },
        },
      },
      orderBy: { product: { name: 'asc' } },
    });
    return reqs.map((r) => {
      const pending = round3(
        Math.max(0, r.requiredQuantity.toNumber() - r.deliveredQuantity.toNumber()),
      );
      const stock = r.product.currentStock.toNumber();
      return {
        productId: r.product.id,
        productName: r.product.name,
        productCode: r.product.code,
        unitAbbreviation: r.product.unit.abbreviation,
        required: pending,
        available: stock,
        missing: round3(Math.max(0, pending - stock)),
      };
    });
  }

  async confirm(
    id: string,
    defaultToleranceKg: number,
  ): Promise<{ order: ProductionDetail; shortages: AvailabilityLine[] }> {
    const shortages = await this.db.$transaction(async (tx) => {
      const order = await tx.productionOrder.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!order) throw new NotFoundError('Orden de producción', id);
      assertTransition(order.status, 'CONFIRMED');

      // Congela por item: versión vigente + snapshots de costo (RN-03)
      const tolerances = new Map<string, number>();
      const explosion: ExplosionItem[] = [];
      const productMeta = new Map<
        string,
        { name: string; code: string; unit: string; stock: number }
      >();

      for (const item of order.items) {
        const v = await this.currentVersionOrThrow(tx, item.recipeId);
        const perPortion = v.recipe.costPerPortion.toNumber();
        await tx.productionOrderItem.update({
          where: { id: item.id },
          data: {
            recipeVersionId: v.id,
            costPerPortionSnapshot: perPortion,
            totalCostSnapshot: round2(perPortion * item.portions),
          },
        });
        explosion.push({
          portions: item.portions,
          yieldPortions: v.recipe.yieldPortions,
          ingredients: v.ingredients.map((ing) => {
            productMeta.set(ing.product.id, {
              name: ing.product.name,
              code: ing.product.code,
              unit: ing.product.unit.abbreviation,
              stock: ing.product.currentStock.toNumber(),
            });
            tolerances.set(
              ing.product.id,
              ing.product.toleranceKg?.toNumber() ?? defaultToleranceKg,
            );
            return {
              productId: ing.product.id,
              quantity: ing.quantity.toNumber(),
              factorToBase: ing.unit.factorToBase.toNumber(),
            };
          }),
        });
      }

      // Explosión consolidada → production_requirements (RF-04.2, RN-04)
      const totals = explodeRequirements(explosion);
      await tx.productionRequirement.createMany({
        data: [...totals].map(([productId, required]) => ({
          orderId: id,
          productId,
          requiredQuantity: required,
          toleranceApplied: tolerances.get(productId) ?? defaultToleranceKg,
        })),
      });

      await tx.productionOrder.update({
        where: { id },
        data: { status: 'CONFIRMED', confirmedAt: new Date() },
      });

      // Faltantes detectados (se ADVIERTEN, no bloquean: RF-04.3)
      return [...totals]
        .map(([productId, required]) => {
          const p = productMeta.get(productId)!;
          return {
            productId,
            productName: p.name,
            productCode: p.code,
            unitAbbreviation: p.unit,
            required,
            available: p.stock,
            missing: round3(Math.max(0, required - p.stock)),
          };
        })
        .filter((l) => l.missing > 0);
    });
    return { order: (await this.findById(id))!, shortages };
  }

  async transition(id: string, to: ProductionStatus): Promise<ProductionDetail> {
    await this.db.$transaction(async (tx) => {
      const order = await tx.productionOrder.findUnique({ where: { id } });
      if (!order) throw new NotFoundError('Orden de producción', id);
      assertTransition(order.status, to);

      if (to === 'CANCELLED') {
        const deliveries = await tx.delivery.count({
          where: { requirement: { orderId: id } },
        });
        if (deliveries > 0) {
          throw new BusinessRuleError(
            ERROR_CODES.INVALID_TRANSITION,
            'No se puede cancelar una orden con entregas registradas',
            { deliveries },
          );
        }
      }

      await tx.productionOrder.update({
        where: { id },
        data: { status: to, ...(to === 'CLOSED' && { closedAt: new Date() }) },
      });
    });
    return (await this.findById(id))!;
  }

  /** Órdenes activas del día para el monitor de cocina (RF-11, no incluye DRAFT/CANCELLED/CLOSED). */
  private static readonly KITCHEN_ACTIVE_STATUSES: ProductionStatus[] = [
    'CONFIRMED',
    'IN_DELIVERY',
    'DELIVERED',
    'IN_PREPARATION',
    'COMPLETED',
  ];

  async kitchenSummary(date: Date): Promise<KitchenSummary> {
    const day = toDateOnlyUTC(date);
    const orders = await this.db.productionOrder.findMany({
      where: { date: day, status: { in: PrismaProductionRepository.KITCHEN_ACTIVE_STATUSES } },
      include: {
        items: { include: { recipe: { select: { id: true, name: true, imageUrl: true } } } },
        requirements: { select: { requiredQuantity: true, deliveredQuantity: true } },
      },
    });

    interface RecipeAcc {
      recipeId: string;
      recipeName: string;
      imageUrl: string | null;
      totalPortions: number;
      weightedPctSum: number;
    }
    const byRecipe = new Map<string, RecipeAcc>();

    for (const order of orders) {
      const totals = order.requirements.reduce(
        (acc, r) => ({
          required: acc.required + r.requiredQuantity.toNumber(),
          delivered: acc.delivered + r.deliveredQuantity.toNumber(),
        }),
        { required: 0, delivered: 0 },
      );
      const orderPct = totals.required > 0 ? (totals.delivered / totals.required) * 100 : 0;

      for (const item of order.items) {
        const acc = byRecipe.get(item.recipeId) ?? {
          recipeId: item.recipeId,
          recipeName: item.recipe.name,
          imageUrl: item.recipe.imageUrl,
          totalPortions: 0,
          weightedPctSum: 0,
        };
        acc.totalPortions += item.portions;
        acc.weightedPctSum += orderPct * item.portions;
        byRecipe.set(item.recipeId, acc);
      }
    }

    // Versión vigente de cada receta (ingredientes + steps/notes) en una sola
    // consulta para todas las recetas del día (evita N+1 — antes se llamaba
    // currentVersionOrThrow por receta dentro del for de abajo).
    const recipeIds = [...byRecipe.keys()];
    const versions = await this.db.recipeVersion.findMany({
      where: { recipeId: { in: recipeIds }, isCurrent: true },
      include: { ...currentVersionInclude, recipe: { select: { yieldPortions: true } } },
    });
    const versionByRecipe = new Map(versions.map((v) => [v.recipeId, v]));

    const recipes: KitchenRecipeCard[] = [];
    for (const acc of byRecipe.values()) {
      let ingredients: KitchenRecipeCard['ingredients'] = [];
      let steps: string[] = [];
      let notes: string | null = null;
      const version = versionByRecipe.get(acc.recipeId);
      if (version) {
        // Receta desactivada intra-día pero con versión vigente igual se
        // muestra normal; solo falta si el recipeVersion en sí desapareció.
        const scale = acc.totalPortions / version.recipe.yieldPortions;
        ingredients = version.ingredients.map((ing) => ({
          productName: ing.product.name,
          quantity: round3(ing.quantity.toNumber() * scale),
          unitAbbreviation: ing.product.unit.abbreviation,
        }));
        steps = (version.steps as { order: number; text: string }[])
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((s) => s.text);
        notes = version.notes;
      }
      recipes.push({
        recipeId: acc.recipeId,
        recipeName: acc.recipeName,
        imageUrl: acc.imageUrl,
        totalPortions: acc.totalPortions,
        deliveredPct: acc.totalPortions > 0 ? Math.round(acc.weightedPctSum / acc.totalPortions) : 0,
        ingredients,
        steps,
        notes,
      });
    }

    return {
      date: day.toISOString().slice(0, 10),
      recipes: recipes.sort((a, b) => a.recipeName.localeCompare(b.recipeName)),
    };
  }
}
