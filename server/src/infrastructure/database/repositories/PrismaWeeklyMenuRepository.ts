import type { PrismaClient } from '@prisma/client';
import { MEAL_TIMES, type MealTime, type WeekDay, type WeeklyMenuSlotSetInput } from '@gaby/shared';
import { explodeRequirements } from '../../../domain/services/production.js';
import type {
  IWeeklyMenuRepository,
  MenuSlotForDate,
  WeeklyMenuSlotDTO,
} from '../../../domain/repositories/IWeeklyMenuRepository.js';

/** date.getUTCDay(): 0=domingo..6=sábado (RN: producción/ventas usan fecha pura UTC). */
const JS_DAY_TO_WEEKDAY: WeekDay[] = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

export class PrismaWeeklyMenuRepository implements IWeeklyMenuRepository {
  constructor(private readonly db: PrismaClient) {}

  async listSlots(): Promise<WeeklyMenuSlotDTO[]> {
    const slots = await this.db.weeklyMenuSlot.findMany({
      include: { category: { select: { name: true } }, recipe: { select: { name: true } } },
      orderBy: [{ dayOfWeek: 'asc' }, { mealTime: 'asc' }, { category: { name: 'asc' } }],
    });
    return slots.map((s) => ({
      id: s.id,
      dayOfWeek: s.dayOfWeek as WeekDay,
      mealTime: s.mealTime as MealTime,
      categoryId: s.categoryId,
      categoryName: s.category.name,
      recipeId: s.recipeId,
      recipeName: s.recipe.name,
    }));
  }

  async setSlot(input: WeeklyMenuSlotSetInput): Promise<void> {
    if (input.recipeId === null) {
      await this.db.weeklyMenuSlot.deleteMany({
        where: { dayOfWeek: input.dayOfWeek, mealTime: input.mealTime, categoryId: input.categoryId },
      });
      return;
    }
    await this.db.weeklyMenuSlot.upsert({
      where: {
        dayOfWeek_mealTime_categoryId: {
          dayOfWeek: input.dayOfWeek,
          mealTime: input.mealTime,
          categoryId: input.categoryId,
        },
      },
      update: { recipeId: input.recipeId },
      create: {
        dayOfWeek: input.dayOfWeek,
        mealTime: input.mealTime,
        categoryId: input.categoryId,
        recipeId: input.recipeId,
      },
    });
  }

  async getMenuForDate(date: Date): Promise<MenuSlotForDate[]> {
    const dayOfWeek = JS_DAY_TO_WEEKDAY[date.getUTCDay()]!;
    const [categories, slots] = await Promise.all([
      this.db.category.findMany({
        where: { kind: 'RECIPE', isActive: true },
        orderBy: { name: 'asc' },
      }),
      this.db.weeklyMenuSlot.findMany({
        where: { dayOfWeek },
        include: { recipe: { select: { id: true, name: true } } },
      }),
    ]);

    const result: MenuSlotForDate[] = [];
    for (const mealTime of MEAL_TIMES) {
      for (const category of categories) {
        const slot = slots.find((s) => s.mealTime === mealTime && s.categoryId === category.id);
        if (!slot) {
          result.push({
            mealTime,
            categoryId: category.id,
            categoryName: category.name,
            recipeId: null,
            recipeName: null,
            hasStock: null,
            suggestion: null,
          });
          continue;
        }
        const sufficient = await this.hasSufficientStock(slot.recipeId);
        const suggestion = sufficient ? null : await this.findAlternative(category.id, slot.recipeId);
        result.push({
          mealTime,
          categoryId: category.id,
          categoryName: category.name,
          recipeId: slot.recipeId,
          recipeName: slot.recipe.name,
          hasStock: sufficient,
          suggestion,
        });
      }
    }
    return result;
  }

  /** ¿Hay stock para producir el rendimiento base de la receta (referencia — no porciones reales aún)? */
  private async hasSufficientStock(recipeId: string): Promise<boolean> {
    const version = await this.db.recipeVersion.findFirst({
      where: { recipeId, isCurrent: true },
      include: {
        recipe: { select: { yieldPortions: true } },
        ingredients: {
          include: {
            product: { select: { currentStock: true } },
            unit: { select: { factorToBase: true } },
          },
        },
      },
    });
    if (!version) return false;

    const required = explodeRequirements([
      {
        portions: version.recipe.yieldPortions,
        yieldPortions: version.recipe.yieldPortions,
        ingredients: version.ingredients.map((i) => ({
          productId: i.productId,
          quantity: i.quantity.toNumber(),
          factorToBase: i.unit.factorToBase.toNumber(),
        })),
      },
    ]);
    return version.ingredients.every(
      (i) => (required.get(i.productId) ?? 0) <= i.product.currentStock.toNumber(),
    );
  }

  /** Otra receta activa de la misma categoría (dieta) con stock completo, si existe. */
  private async findAlternative(
    categoryId: string,
    excludeRecipeId: string,
  ): Promise<{ recipeId: string; recipeName: string } | null> {
    const candidates = await this.db.recipe.findMany({
      where: { categoryId, isActive: true, id: { not: excludeRecipeId } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    for (const candidate of candidates) {
      if (await this.hasSufficientStock(candidate.id)) {
        return { recipeId: candidate.id, recipeName: candidate.name };
      }
    }
    return null;
  }
}
