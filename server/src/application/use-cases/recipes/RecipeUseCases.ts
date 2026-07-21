import {
  SOCKET_ROOMS,
  type AuthUser,
  type RecipeCreateInput,
  type RecipeReviseInput,
  type RecipeUpdateInput,
  type RecipesQuery,
} from '@gaby/shared';
import type { IRecipeRepository } from '../../../domain/repositories/IRecipeRepository.js';
import { NotFoundError } from '../../../domain/errors/AppError.js';
import type { IAuditLogger } from '../../ports/IAuditLogger.js';
import type { IEventBus } from '../../ports/IEventBus.js';

/** Casos de uso de recetas (agrupados por agregado, ver InventoryUseCases). */
export class RecipeUseCases {
  constructor(
    private readonly recipes: IRecipeRepository,
    private readonly audit: IAuditLogger,
    private readonly events: IEventBus,
  ) {}

  list(query: RecipesQuery) {
    return this.recipes.list(query);
  }

  async get(id: string) {
    const recipe = await this.recipes.findById(id);
    if (!recipe) throw new NotFoundError('Receta', id);
    return recipe;
  }

  async create(input: RecipeCreateInput, user: AuthUser) {
    const recipe = await this.recipes.create(input, user.id);
    await this.audit.log({
      kind: 'CRUD',
      userId: user.id,
      action: 'recipe.create',
      resource: 'recipes',
      resourceId: recipe.id,
      after: { name: input.name, ingredients: input.ingredients.length },
    });
    this.events.publish('recipe:cost-changed', { recipeIds: [recipe.id] }, [SOCKET_ROOMS.ADMIN]);
    return recipe;
  }

  async update(id: string, input: RecipeUpdateInput, user: AuthUser) {
    const before = await this.recipes.findById(id);
    if (!before) throw new NotFoundError('Receta', id);
    const recipe = await this.recipes.update(id, input);
    await this.audit.log({
      kind: 'CRUD',
      userId: user.id,
      action: 'recipe.update',
      resource: 'recipes',
      resourceId: id,
      before: {
        yieldPortions: before.yieldPortions,
        targetMarginPct: before.targetMarginPct,
        sellingPrice: before.sellingPrice,
      },
      after: input,
    });
    this.events.publish('recipe:cost-changed', { recipeIds: [id] }, [SOCKET_ROOMS.ADMIN]);
    return recipe;
  }

  /** Nueva versión de ingredientes/pasos (RF-02.5): el histórico queda intacto. */
  async revise(id: string, input: RecipeReviseInput, user: AuthUser) {
    const recipe = await this.recipes.revise(id, input, user.id);
    await this.audit.log({
      kind: 'CRUD',
      userId: user.id,
      action: 'recipe.revise',
      resource: 'recipes',
      resourceId: id,
      after: { version: recipe.currentVersionNumber, ingredients: input.ingredients.length },
    });
    this.events.publish('recipe:cost-changed', { recipeIds: [id] }, [
      SOCKET_ROOMS.ADMIN,
      SOCKET_ROOMS.KITCHEN,
    ]);
    return recipe;
  }

  async deactivate(id: string, user: AuthUser) {
    await this.recipes.setActive(id, false);
    await this.audit.log({
      kind: 'CRUD',
      userId: user.id,
      action: 'recipe.deactivate',
      resource: 'recipes',
      resourceId: id,
    });
  }
}
