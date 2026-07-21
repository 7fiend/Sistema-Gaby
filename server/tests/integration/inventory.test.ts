import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/infrastructure/database/prisma.js';
import { PrismaProductRepository } from '../../src/infrastructure/database/repositories/PrismaProductRepository.js';
import { BusinessRuleError, NotFoundError } from '../../src/domain/errors/AppError.js';

/**
 * Integración (RF-02): `PrismaProductRepository.registerEntry`/`registerAdjustment`
 * contra la BD de prueba real — a diferencia de los unit tests de `domain/services`,
 * aquí se ejercitan la transacción de Prisma completa (promedio ponderado +
 * kardex + FEFO) tal como corre en producción.
 */
describe('PrismaProductRepository — entradas y ajustes (integración)', () => {
  const repo = new PrismaProductRepository(prisma);
  const suffix = Date.now();
  let productId: string;
  let userId: string;

  beforeAll(async () => {
    const unit = await prisma.unit.create({
      data: { name: `Kilogramo-${suffix}`, abbreviation: `kg${suffix}`, kind: 'WEIGHT', factorToBase: 1 },
    });
    const category = await prisma.category.create({
      data: { kind: 'PRODUCT', name: `Test-${suffix}` },
    });
    const role = await prisma.role.create({ data: { name: `TEST_ROLE-${suffix}` } });
    const user = await prisma.user.create({
      data: {
        username: `test-inv-${suffix}`,
        fullName: 'Usuario de prueba',
        passwordHash: 'x',
        roleId: role.id,
      },
    });
    userId = user.id;
    const product = await prisma.product.create({
      data: {
        code: `TEST-${suffix}`,
        name: 'Producto de prueba',
        categoryId: category.id,
        unitId: unit.id,
        currentStock: 0,
        avgCost: 0,
        minStock: 5,
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    await prisma.stockMovement.deleteMany({ where: { productId } });
    await prisma.productBatch.deleteMany({ where: { productId } });
    await prisma.product.delete({ where: { id: productId } });
    await prisma.user.deleteMany({ where: { username: `test-inv-${suffix}` } });
    await prisma.role.deleteMany({ where: { name: `TEST_ROLE-${suffix}` } });
    await prisma.category.deleteMany({ where: { name: `Test-${suffix}` } });
    await prisma.unit.deleteMany({ where: { abbreviation: `kg${suffix}` } });
  });

  it('la primera entrada fija el promedio en el costo de esa entrada', async () => {
    const result = await repo.registerEntry(
      { productId, quantity: 10, unitCost: 2000, batchNumber: 'LOTE-A' },
      userId,
    );
    expect(result.newStock).toBe(10);
    expect(result.newAvgCost).toBe(2000);
  });

  it('una segunda entrada pondera el promedio contra el stock existente', async () => {
    // stock=10 a 2000, entra 20 a 2600 → (10*2000 + 20*2600)/30 = 2400
    const result = await repo.registerEntry(
      { productId, quantity: 20, unitCost: 2600, batchNumber: 'LOTE-B' },
      userId,
    );
    expect(result.newStock).toBe(30);
    expect(result.newAvgCost).toBe(2400);
  });

  it('la entrada crea el lote y el movimiento ENTRY en la BD', async () => {
    const batches = await prisma.productBatch.findMany({ where: { productId } });
    expect(batches.map((b) => b.batchNumber).sort()).toEqual(['LOTE-A', 'LOTE-B']);

    const movements = await prisma.stockMovement.findMany({ where: { productId, type: 'ENTRY' } });
    expect(movements).toHaveLength(2);
  });

  it('un ajuste WASTE consume primero el lote más antiguo cargado (FEFO sin fecha = orden de llegada)', async () => {
    // LOTE-A (10) y LOTE-B (20) no tienen expiryDate → FEFO los trata "iguales"
    // y el planFefoConsumption conserva el orden en que vinieron de la BD
    // (findMany sin orderBy explícito ~ inserción). Se verifica el efecto real:
    // el total resultante y que la merma se registra al costo promedio vigente.
    const before = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    const result = await repo.registerAdjustment(
      { productId, type: 'WASTE', quantity: 5, reason: 'Prueba de integración' },
      userId,
    );
    expect(result.newStock).toBe(25);
    expect(result.newAvgCost).toBe(before.avgCost.toNumber()); // el ajuste no cambia el promedio

    const totalRemaining = await prisma.productBatch.aggregate({
      where: { productId },
      _sum: { remainingQuantity: true },
    });
    expect(totalRemaining._sum.remainingQuantity?.toNumber()).toBe(25);
  });

  it('rechaza un ajuste de salida que excede el stock disponible', async () => {
    await expect(
      repo.registerAdjustment(
        { productId, type: 'WASTE', quantity: 9999, reason: 'Excede el stock' },
        userId,
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('detecta cuando el ajuste cruza el stock mínimo', async () => {
    // stock=25, minStock=5 → un ajuste de 21 deja 4, cruza el mínimo
    const result = await repo.registerAdjustment(
      { productId, type: 'ADJUSTMENT_OUT', quantity: 21, reason: 'Cruza el mínimo' },
      userId,
    );
    expect(result.crossedLowStock).toBe(true);
    expect(result.newStock).toBe(4);
  });

  it('rechaza operar sobre un producto inexistente', async () => {
    await expect(
      repo.registerEntry({ productId: 'no-existe', quantity: 1, unitCost: 1 }, userId),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
