import type { Prisma, PrismaClient } from '@prisma/client';
import {
  ERROR_CODES,
  type AdjustmentInput,
  type EntryInput,
  type Paginated,
  type ProductInput,
  type ProductsQuery,
} from '@gaby/shared';
import type {
  BatchItem,
  ExpiringBatch,
  IProductRepository,
  MovementItem,
  ProductListItem,
  StockChangeResult,
} from '../../../domain/repositories/IProductRepository.js';
import { BusinessRuleError, NotFoundError } from '../../../domain/errors/AppError.js';
import { round3, weightedAverageCost } from '../../../domain/services/costing.js';
import { planFefoConsumption } from '../../../domain/services/fefo.js';

const listInclude = {
  category: { select: { id: true, name: true } },
  unit: { select: { id: true, abbreviation: true } },
  supplier: { select: { id: true, name: true } },
} as const;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof listInclude }>;

function toListItem(p: ProductRow): ProductListItem {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    category: p.category,
    unit: p.unit,
    supplier: p.supplier,
    currentStock: p.currentStock.toNumber(),
    minStock: p.minStock.toNumber(),
    avgCost: p.avgCost.toNumber(),
    lastCost: p.lastCost.toNumber(),
    location: p.location,
    isWeighable: p.isWeighable,
    toleranceKg: p.toleranceKg?.toNumber() ?? null,
    usageType: p.usageType,
    isActive: p.isActive,
  };
}

export class PrismaProductRepository implements IProductRepository {
  constructor(private readonly db: PrismaClient) {}

  async list(query: ProductsQuery): Promise<Paginated<ProductListItem>> {
    const where: Prisma.ProductWhereInput = {
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(query.categoryId && { categoryId: query.categoryId }),
      ...(query.usageType && { usageType: query.usageType }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { code: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
      // stock bajo: comparación columna-a-columna vía SQL crudo no es trivial
      // en Prisma; se filtra abajo cuando lowStock=true (catálogos pequeños).
    };

    if (query.lowStock) {
      const all = await this.db.product.findMany({
        where,
        include: listInclude,
        orderBy: { name: 'asc' },
      });
      const low = all.filter((p) => p.currentStock.lte(p.minStock));
      const start = (query.page - 1) * query.pageSize;
      return {
        items: low.slice(start, start + query.pageSize).map(toListItem),
        total: low.length,
        page: query.page,
        pageSize: query.pageSize,
        totalPages: Math.max(1, Math.ceil(low.length / query.pageSize)),
      };
    }

    const [rows, total] = await this.db.$transaction([
      this.db.product.findMany({
        where,
        include: listInclude,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.product.count({ where }),
    ]);

    return {
      items: rows.map(toListItem),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async findById(id: string): Promise<ProductListItem | null> {
    const p = await this.db.product.findUnique({ where: { id }, include: listInclude });
    return p ? toListItem(p) : null;
  }

  async findBatches(productId: string): Promise<BatchItem[]> {
    const batches = await this.db.productBatch.findMany({
      where: { productId, remainingQuantity: { gt: 0 } },
      orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { receivedAt: 'asc' }],
    });
    return batches.map((b) => ({
      id: b.id,
      batchNumber: b.batchNumber,
      initialQuantity: b.initialQuantity.toNumber(),
      remainingQuantity: b.remainingQuantity.toNumber(),
      unitCost: b.unitCost.toNumber(),
      expiryDate: b.expiryDate,
      receivedAt: b.receivedAt,
    }));
  }

  async listMovements(
    productId: string,
    page: number,
    pageSize: number,
  ): Promise<Paginated<MovementItem>> {
    const where = { productId };
    const [rows, total] = await this.db.$transaction([
      this.db.stockMovement.findMany({
        where,
        include: { user: { select: { fullName: true } }, batch: { select: { batchNumber: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.stockMovement.count({ where }),
    ]);
    return {
      items: rows.map((m) => ({
        id: m.id,
        type: m.type,
        quantity: m.quantity.toNumber(),
        unitCost: m.unitCost.toNumber(),
        totalCost: m.totalCost.toNumber(),
        balanceAfter: m.balanceAfter.toNumber(),
        reason: m.reason,
        reference: m.reference,
        batchNumber: m.batch?.batchNumber ?? null,
        userName: m.user.fullName,
        createdAt: m.createdAt,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async create(input: ProductInput, initialCost = 0): Promise<ProductListItem> {
    const p = await this.db.product.create({
      data: {
        code: input.code.toUpperCase(),
        name: input.name,
        categoryId: input.categoryId,
        supplierId: input.supplierId ?? null,
        unitId: input.unitId,
        minStock: input.minStock,
        location: input.location ?? null,
        isWeighable: input.isWeighable,
        toleranceKg: input.toleranceKg ?? null,
        usageType: input.usageType,
        avgCost: initialCost,
        lastCost: initialCost,
      },
      include: listInclude,
    });
    return toListItem(p);
  }

  async update(id: string, input: Partial<ProductInput>): Promise<ProductListItem> {
    const p = await this.db.product.update({
      where: { id },
      data: {
        ...(input.code !== undefined && { code: input.code.toUpperCase() }),
        ...(input.name !== undefined && { name: input.name }),
        ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
        ...(input.supplierId !== undefined && { supplierId: input.supplierId }),
        ...(input.unitId !== undefined && { unitId: input.unitId }),
        ...(input.minStock !== undefined && { minStock: input.minStock }),
        ...(input.location !== undefined && { location: input.location }),
        ...(input.isWeighable !== undefined && { isWeighable: input.isWeighable }),
        ...(input.toleranceKg !== undefined && { toleranceKg: input.toleranceKg }),
        ...(input.usageType !== undefined && { usageType: input.usageType }),
      },
      include: listInclude,
    });
    return toListItem(p);
  }

  async setActive(id: string, isActive: boolean): Promise<void> {
    await this.db.product.update({ where: { id }, data: { isActive } });
  }

  async registerEntry(input: EntryInput, userId: string): Promise<StockChangeResult> {
    return this.db.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: input.productId } });
      if (!product) throw new NotFoundError('Producto', input.productId);

      const stock = product.currentStock.toNumber();
      const newAvg = weightedAverageCost(
        stock,
        product.avgCost.toNumber(),
        input.quantity,
        input.unitCost,
      );
      const newStock = round3(stock + input.quantity);

      const batch = await tx.productBatch.create({
        data: {
          productId: product.id,
          batchNumber: input.batchNumber?.trim() || `L-${Date.now()}`,
          initialQuantity: input.quantity,
          remainingQuantity: input.quantity,
          unitCost: input.unitCost,
          expiryDate: input.expiryDate ?? null,
        },
      });

      const movement = await tx.stockMovement.create({
        data: {
          productId: product.id,
          batchId: batch.id,
          type: 'ENTRY',
          quantity: input.quantity,
          unitCost: input.unitCost,
          totalCost: input.quantity * input.unitCost,
          balanceAfter: newStock,
          reason: input.reason ?? 'Entrada de inventario',
          reference: 'purchase',
          userId,
        },
      });

      await tx.product.update({
        where: { id: product.id },
        data: { currentStock: newStock, avgCost: newAvg, lastCost: input.unitCost },
      });

      return {
        movementId: movement.id,
        newStock,
        newAvgCost: newAvg,
        crossedLowStock: false,
      };
    });
  }

  async registerAdjustment(input: AdjustmentInput, userId: string): Promise<StockChangeResult> {
    return this.db.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: input.productId } });
      if (!product) throw new NotFoundError('Producto', input.productId);

      const stock = product.currentStock.toNumber();
      const minStock = product.minStock.toNumber();
      const avgCost = product.avgCost.toNumber();
      const isInbound = input.type === 'ADJUSTMENT_IN';

      if (!isInbound && input.quantity > stock) {
        throw new BusinessRuleError(
          ERROR_CODES.INSUFFICIENT_STOCK,
          `Stock insuficiente: hay ${stock} y se intenta descontar ${input.quantity}`,
          { available: stock, requested: input.quantity },
        );
      }

      const newStock = round3(isInbound ? stock + input.quantity : stock - input.quantity);

      if (!isInbound) {
        // Consumo FEFO de lotes (RN-05)
        const batches = await tx.productBatch.findMany({
          where: { productId: product.id, remainingQuantity: { gt: 0 } },
        });
        const plan = planFefoConsumption(
          batches.map((b) => ({
            id: b.id,
            remainingQuantity: b.remainingQuantity.toNumber(),
            expiryDate: b.expiryDate,
          })),
          input.quantity,
        );
        for (const c of plan.consumptions) {
          await tx.productBatch.update({
            where: { id: c.batchId },
            data: { remainingQuantity: { decrement: c.quantity } },
          });
        }
      }

      const movement = await tx.stockMovement.create({
        data: {
          productId: product.id,
          type: input.type,
          quantity: input.quantity,
          unitCost: avgCost, // salida valorada al promedio vigente (RN-03)
          totalCost: input.quantity * avgCost,
          balanceAfter: newStock,
          reason: input.reason,
          reference: 'manual',
          userId,
        },
      });

      await tx.product.update({
        where: { id: product.id },
        data: { currentStock: newStock },
      });

      return {
        movementId: movement.id,
        newStock,
        newAvgCost: avgCost,
        crossedLowStock: stock > minStock && newStock <= minStock,
      };
    });
  }

  async findExpiringBatches(before: Date): Promise<ExpiringBatch[]> {
    const rows = await this.db.productBatch.findMany({
      where: {
        expiryDate: { not: null, lte: before },
        remainingQuantity: { gt: 0 },
        product: { isActive: true },
      },
      select: {
        id: true,
        batchNumber: true,
        remainingQuantity: true,
        expiryDate: true,
        product: {
          select: { id: true, name: true, unit: { select: { abbreviation: true } } },
        },
      },
      orderBy: { expiryDate: 'asc' },
    });
    return rows.map((b) => ({
      batchId: b.id,
      batchNumber: b.batchNumber,
      productId: b.product.id,
      productName: b.product.name,
      remainingQuantity: b.remainingQuantity.toNumber(),
      unitAbbreviation: b.product.unit.abbreviation,
      // expiryDate no puede ser null por el filtro `not: null`
      expiryDate: b.expiryDate as Date,
    }));
  }
}
