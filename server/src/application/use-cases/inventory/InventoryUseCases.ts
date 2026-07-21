import {
  SOCKET_ROOMS,
  type AdjustmentInput,
  type AuthUser,
  type EntryInput,
  type ProductInput,
  type ProductsQuery,
  type RoutineConsumptionInput,
} from '@gaby/shared';
import type {
  IProductRepository,
  StockChangeResult,
} from '../../../domain/repositories/IProductRepository.js';
import type { IRecipeRepository } from '../../../domain/repositories/IRecipeRepository.js';
import type { IAlertRepository } from '../../../domain/repositories/IAlertRepository.js';
import { NotFoundError, ValidationError } from '../../../domain/errors/AppError.js';
import type { IAuditLogger } from '../../ports/IAuditLogger.js';
import type { IEventBus } from '../../ports/IEventBus.js';

/**
 * Casos de uso del inventario, agrupados por agregado (decisión de altitud:
 * un archivo por operación sería ceremonia sin beneficio a esta escala;
 * cada método público ES un caso de uso y mantiene el mismo contrato).
 */
export class InventoryUseCases {
  constructor(
    private readonly products: IProductRepository,
    private readonly recipes: IRecipeRepository,
    private readonly alerts: IAlertRepository,
    private readonly audit: IAuditLogger,
    private readonly events: IEventBus,
  ) {}

  listProducts(query: ProductsQuery) {
    return this.products.list(query);
  }

  async getProduct(id: string) {
    const product = await this.products.findById(id);
    if (!product) throw new NotFoundError('Producto', id);
    const batches = await this.products.findBatches(id);
    return { ...product, batches };
  }

  listMovements(productId: string, page: number, pageSize: number) {
    return this.products.listMovements(productId, page, pageSize);
  }

  async createProduct(input: ProductInput, user: AuthUser) {
    const product = await this.products.create(input);
    await this.audit.log({
      kind: 'CRUD',
      userId: user.id,
      action: 'product.create',
      resource: 'products',
      resourceId: product.id,
      after: input,
    });
    return product;
  }

  async updateProduct(id: string, input: Partial<ProductInput>, user: AuthUser) {
    const before = await this.products.findById(id);
    if (!before) throw new NotFoundError('Producto', id);
    const product = await this.products.update(id, input);
    await this.audit.log({
      kind: 'CRUD',
      userId: user.id,
      action: 'product.update',
      resource: 'products',
      resourceId: id,
      before,
      after: input,
    });
    return product;
  }

  async deactivateProduct(id: string, user: AuthUser) {
    await this.products.setActive(id, false);
    await this.audit.log({
      kind: 'CRUD',
      userId: user.id,
      action: 'product.deactivate',
      resource: 'products',
      resourceId: id,
    });
  }

  /** Entrada de inventario: lote + kardex + promedio ponderado + cascada de recetas. */
  async registerEntry(input: EntryInput, user: AuthUser): Promise<StockChangeResult> {
    const result = await this.products.registerEntry(input, user.id);

    await this.audit.log({
      kind: 'INVENTORY',
      userId: user.id,
      action: 'inventory.entry',
      resource: 'inventory',
      resourceId: result.movementId,
      after: { ...input, newStock: result.newStock, newAvgCost: result.newAvgCost },
    });

    // RF-02.4: el cambio de costo promedio recalcula las recetas afectadas
    const affectedRecipes = await this.recipes.recalculateForProducts([input.productId]);

    this.events.publish('stock:changed', { productId: input.productId }, [SOCKET_ROOMS.ADMIN]);
    if (affectedRecipes.length > 0) {
      this.events.publish('recipe:cost-changed', { recipeIds: affectedRecipes }, [
        SOCKET_ROOMS.ADMIN,
        SOCKET_ROOMS.KITCHEN,
      ]);
    }
    return result;
  }

  /** Ajustes y mermas: FEFO + kardex; alerta si cruza el stock mínimo. */
  async registerAdjustment(input: AdjustmentInput, user: AuthUser): Promise<StockChangeResult> {
    const result = await this.products.registerAdjustment(input, user.id);

    await this.audit.log({
      kind: 'INVENTORY',
      userId: user.id,
      action: `inventory.${input.type.toLowerCase()}`,
      resource: 'inventory',
      resourceId: result.movementId,
      after: { ...input, newStock: result.newStock },
    });

    this.events.publish('stock:changed', { productId: input.productId }, [SOCKET_ROOMS.ADMIN]);

    if (result.crossedLowStock) {
      const product = await this.products.findById(input.productId);
      if (product) {
        await this.alerts.create('stock_low', `Stock bajo: ${product.name} (${result.newStock} ${product.unit.abbreviation}, mínimo ${product.minStock})`, {
          productId: product.id,
        });
        this.events.publish('stock:low', { productId: product.id, name: product.name }, [
          SOCKET_ROOMS.ADMIN,
        ]);
      }
    }
    return result;
  }

  /**
   * Fase 18: consumo diario de productos de aseo (rutina, no báscula). Reutiliza
   * registerAdjustment (FEFO + kardex + alerta stock bajo) con una salida
   * ADJUSTMENT_OUT por producto y motivo fijo; valida que cada producto sea
   * usageType=ROUTINE — así bodega registra esto sin ganar inventory:adjust
   * general (esa acción sigue siendo solo de admin).
   */
  async registerRoutineConsumption(input: RoutineConsumptionInput, user: AuthUser): Promise<StockChangeResult[]> {
    const results: StockChangeResult[] = [];
    for (const entry of input.entries) {
      if (entry.quantity <= 0) continue;
      const product = await this.products.findById(entry.productId);
      if (!product) throw new NotFoundError('Producto', entry.productId);
      if (product.usageType !== 'ROUTINE') {
        throw new ValidationError(`"${product.name}" no está marcado como consumo por rutina`);
      }
      results.push(
        await this.registerAdjustment(
          {
            productId: entry.productId,
            type: 'ADJUSTMENT_OUT',
            quantity: entry.quantity,
            reason: 'Rutina de aseo diaria',
          },
          user,
        ),
      );
    }
    return results;
  }
}
