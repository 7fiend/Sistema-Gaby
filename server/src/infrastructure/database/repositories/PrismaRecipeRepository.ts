import type { Prisma, PrismaClient } from '@prisma/client';
import type {
  Paginated,
  RecipeCreateInput,
  RecipeReviseInput,
  RecipeUpdateInput,
  RecipesQuery,
} from '@gaby/shared';
import type {
  IRecipeRepository,
  RecipeDetail,
  RecipeListItem,
} from '../../../domain/repositories/IRecipeRepository.js';
import { NotFoundError } from '../../../domain/errors/AppError.js';
import {
  costPerPortion,
  recipeTotalCost,
  round4,
  suggestedPrice,
} from '../../../domain/services/costing.js';

type Tx = Prisma.TransactionClient;
type StepJson = { order: number; text: string };

const versionInclude = {
  ingredients: {
    include: {
      product: { select: { id: true, name: true, code: true, avgCost: true } },
      unit: { select: { id: true, abbreviation: true, factorToBase: true } },
    },
  },
} as const;

type VersionRow = Prisma.RecipeVersionGetPayload<{ include: typeof versionInclude }>;

/** Costo vigente del lote de rendimiento a partir de la versión actual. */
function computeVersionCost(version: VersionRow): number {
  return recipeTotalCost(
    version.ingredients.map((i) => ({
      quantityInBase: round4(i.quantity.toNumber() * i.unit.factorToBase.toNumber()),
      avgCost: i.product.avgCost.toNumber(),
    })),
  );
}

function stepsToJson(steps: string[]): StepJson[] {
  return steps.map((text, idx) => ({ order: idx + 1, text }));
}

export class PrismaRecipeRepository implements IRecipeRepository {
  constructor(private readonly db: PrismaClient) {}

  private toListItem(
    r: Prisma.RecipeGetPayload<{ include: { category: { select: { id: true; name: true } } } }>,
    currentVersionNumber: number,
  ): RecipeListItem {
    return {
      id: r.id,
      name: r.name,
      category: r.category,
      imageUrl: r.imageUrl,
      prepTimeMinutes: r.prepTimeMinutes,
      yieldPortions: r.yieldPortions,
      targetMarginPct: r.targetMarginPct.toNumber(),
      currentCost: r.currentCost.toNumber(),
      costPerPortion: r.costPerPortion.toNumber(),
      suggestedPrice: r.suggestedPrice.toNumber(),
      sellingPrice: r.sellingPrice?.toNumber() ?? null,
      isActive: r.isActive,
      currentVersionNumber,
    };
  }

  async list(query: RecipesQuery): Promise<Paginated<RecipeListItem>> {
    const where: Prisma.RecipeWhereInput = {
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(query.categoryId && { categoryId: query.categoryId }),
      ...(query.search && { name: { contains: query.search, mode: 'insensitive' } }),
    };
    const [rows, total] = await this.db.$transaction([
      this.db.recipe.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
          versions: { where: { isCurrent: true }, select: { versionNumber: true } },
        },
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.recipe.count({ where }),
    ]);
    return {
      items: rows.map((r) => this.toListItem(r, r.versions[0]?.versionNumber ?? 1)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async findById(id: string): Promise<RecipeDetail | null> {
    const r = await this.db.recipe.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
        versions: {
          orderBy: { versionNumber: 'desc' },
          include: { ...versionInclude, createdBy: { select: { fullName: true } } },
        },
      },
    });
    if (!r) return null;
    const current = r.versions.find((v) => v.isCurrent) ?? r.versions[0];
    if (!current) return null;

    const steps = (current.steps as StepJson[])
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((s) => s.text);

    return {
      ...this.toListItem(r, current.versionNumber),
      description: r.description,
      notes: current.notes,
      steps,
      ingredients: current.ingredients.map((i) => ({
        productId: i.product.id,
        productName: i.product.name,
        productCode: i.product.code,
        quantity: i.quantity.toNumber(),
        unit: { id: i.unit.id, abbreviation: i.unit.abbreviation },
        currentCost: round4(
          i.quantity.toNumber() * i.unit.factorToBase.toNumber() * i.product.avgCost.toNumber(),
        ),
      })),
      versions: r.versions.map((v) => ({
        versionNumber: v.versionNumber,
        createdAt: v.createdAt,
        createdBy: v.createdBy.fullName,
        isCurrent: v.isCurrent,
      })),
    };
  }

  /** Recalcula y persiste los costos vigentes de una receta (dentro de tx). */
  private async refreshCosts(tx: Tx, recipeId: string): Promise<void> {
    const recipe = await tx.recipe.findUniqueOrThrow({ where: { id: recipeId } });
    const version = await tx.recipeVersion.findFirstOrThrow({
      where: { recipeId, isCurrent: true },
      include: versionInclude,
    });
    const total = computeVersionCost(version);
    const perPortion = costPerPortion(total, recipe.yieldPortions);
    await tx.recipe.update({
      where: { id: recipeId },
      data: {
        currentCost: total,
        costPerPortion: perPortion,
        suggestedPrice: suggestedPrice(perPortion, recipe.targetMarginPct.toNumber()),
      },
    });
  }

  async create(input: RecipeCreateInput, userId: string): Promise<RecipeDetail> {
    const id = await this.db.$transaction(async (tx) => {
      const recipe = await tx.recipe.create({
        data: {
          name: input.name,
          categoryId: input.categoryId,
          description: input.description ?? null,
          imageUrl: input.imageUrl ?? null,
          prepTimeMinutes: input.prepTimeMinutes,
          yieldPortions: input.yieldPortions,
          targetMarginPct: input.targetMarginPct,
          sellingPrice: input.sellingPrice ?? null,
        },
      });
      await tx.recipeVersion.create({
        data: {
          recipeId: recipe.id,
          versionNumber: 1,
          isCurrent: true,
          createdById: userId,
          notes: input.notes ?? null,
          steps: stepsToJson(input.steps),
          ingredients: {
            create: input.ingredients.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
              unitId: i.unitId,
            })),
          },
        },
      });
      await this.refreshCosts(tx, recipe.id);
      return recipe.id;
    });
    return (await this.findById(id))!;
  }

  async update(id: string, input: RecipeUpdateInput): Promise<RecipeDetail> {
    await this.db.$transaction(async (tx) => {
      const exists = await tx.recipe.findUnique({ where: { id } });
      if (!exists) throw new NotFoundError('Receta', id);
      await tx.recipe.update({
        where: { id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
          ...(input.prepTimeMinutes !== undefined && { prepTimeMinutes: input.prepTimeMinutes }),
          ...(input.yieldPortions !== undefined && { yieldPortions: input.yieldPortions }),
          ...(input.targetMarginPct !== undefined && { targetMarginPct: input.targetMarginPct }),
          ...(input.sellingPrice !== undefined && { sellingPrice: input.sellingPrice }),
        },
      });
      // rendimiento o margen afectan costo/porción y precio sugerido
      await this.refreshCosts(tx, id);
    });
    return (await this.findById(id))!;
  }

  async revise(id: string, input: RecipeReviseInput, userId: string): Promise<RecipeDetail> {
    await this.db.$transaction(async (tx) => {
      const last = await tx.recipeVersion.findFirst({
        where: { recipeId: id },
        orderBy: { versionNumber: 'desc' },
      });
      if (!last) throw new NotFoundError('Receta', id);

      await tx.recipeVersion.updateMany({
        where: { recipeId: id, isCurrent: true },
        data: { isCurrent: false },
      });
      await tx.recipeVersion.create({
        data: {
          recipeId: id,
          versionNumber: last.versionNumber + 1,
          isCurrent: true,
          createdById: userId,
          notes: input.notes ?? null,
          steps: stepsToJson(input.steps),
          ingredients: {
            create: input.ingredients.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
              unitId: i.unitId,
            })),
          },
        },
      });
      await this.refreshCosts(tx, id);
    });
    return (await this.findById(id))!;
  }

  async setActive(id: string, isActive: boolean): Promise<void> {
    await this.db.recipe.update({ where: { id }, data: { isActive } });
  }

  async recalculateForProducts(productIds: string[]): Promise<string[]> {
    if (productIds.length === 0) return [];
    const affected = await this.db.recipeVersion.findMany({
      where: { isCurrent: true, ingredients: { some: { productId: { in: productIds } } } },
      select: { recipeId: true },
    });
    const recipeIds = [...new Set(affected.map((a) => a.recipeId))];
    await this.db.$transaction(async (tx) => {
      for (const recipeId of recipeIds) {
        await this.refreshCosts(tx, recipeId);
      }
    });
    return recipeIds;
  }
}
