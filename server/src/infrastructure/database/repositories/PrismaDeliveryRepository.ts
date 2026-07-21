import type { Prisma, PrismaClient } from '@prisma/client';
import { ERROR_CODES, type DeliveryRegisterInput } from '@gaby/shared';
import type {
  DeliveryRecord,
  DeliveryRegisterResult,
  IDeliveryRepository,
} from '../../../domain/repositories/IDeliveryRepository.js';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../../domain/errors/AppError.js';
import { round3 } from '../../../domain/services/costing.js';
import { evaluateDelivery, recomputeRequirementStatus } from '../../../domain/services/delivery.js';
import { planFefoConsumption } from '../../../domain/services/fefo.js';
import { assertTransition } from '../../../domain/services/production.js';

type Tx = Prisma.TransactionClient;

const ACTIVE_ORDER_STATUSES = ['CONFIRMED', 'IN_DELIVERY'];

function toRecord(d: {
  id: string;
  quantity: Prisma.Decimal;
  source: string;
  withinTolerance: boolean;
  approved: boolean;
  createdAt: Date;
}): DeliveryRecord {
  return {
    id: d.id,
    quantity: d.quantity.toNumber(),
    source: d.source as DeliveryRecord['source'],
    withinTolerance: d.withinTolerance,
    approved: d.approved,
    createdAt: d.createdAt,
  };
}

export class PrismaDeliveryRepository implements IDeliveryRepository {
  constructor(private readonly db: PrismaClient) {}

  async register(
    orderId: string,
    requirementId: string,
    input: DeliveryRegisterInput,
    userId: string,
  ): Promise<DeliveryRegisterResult> {
    return this.db.$transaction(async (tx: Tx) => {
      const requirement = await tx.productionRequirement.findUnique({
        where: { id: requirementId },
        include: { order: true, product: true },
      });
      if (!requirement || requirement.orderId !== orderId) {
        throw new NotFoundError('Requerimiento de producción', requirementId);
      }
      if (!ACTIVE_ORDER_STATUSES.includes(requirement.order.status)) {
        throw new BusinessRuleError(
          ERROR_CODES.INVALID_TRANSITION,
          `La orden no admite entregas en estado ${requirement.order.status}`,
          { status: requirement.order.status },
        );
      }
      if (requirement.status === 'DELIVERED') {
        throw new ConflictError('Este insumo ya fue entregado completamente');
      }

      const required = requirement.requiredQuantity.toNumber();
      const deliveredSoFar = requirement.deliveredQuantity.toNumber();
      const tolerance = requirement.toleranceApplied.toNumber();
      const pending = round3(required - deliveredSoFar);

      const evaluation = evaluateDelivery(pending, input.quantity, tolerance, input.mode);

      const base = {
        approved: evaluation.approved,
        withinTolerance: evaluation.withinTolerance,
        deltaKg: evaluation.deltaKg,
        productId: requirement.productId,
        productName: requirement.product.name,
        orderNumber: requirement.order.orderNumber,
      };

      if (!evaluation.approved) {
        // deliveries es append-only (trigger de BD bloquea UPDATE): el intento
        // bloqueado se crea directamente, sin movimiento asociado.
        const blocked = await tx.delivery.create({
          data: {
            requirementId,
            quantity: input.quantity,
            source: input.source,
            readings: input.readings as Prisma.InputJsonValue,
            withinTolerance: evaluation.withinTolerance,
            approved: false,
            deliveredById: userId,
          },
        });
        await tx.productionRequirement.update({
          where: { id: requirementId },
          data: { status: 'BLOCKED' },
        });
        return { delivery: toRecord(blocked), ...base };
      }

      // Aprobada: consumo FEFO (RN-05) dentro de la misma transacción.
      const currentStock = requirement.product.currentStock.toNumber();
      if (input.quantity > currentStock) {
        throw new BusinessRuleError(
          ERROR_CODES.INSUFFICIENT_STOCK,
          `Stock insuficiente: hay ${currentStock} y se intenta entregar ${input.quantity}`,
          { available: currentStock, requested: input.quantity },
        );
      }

      const batches = await tx.productBatch.findMany({
        where: { productId: requirement.productId, remainingQuantity: { gt: 0 } },
        orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { receivedAt: 'asc' }],
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

      const avgCost = requirement.product.avgCost.toNumber();
      const newStock = round3(currentStock - input.quantity);

      await tx.product.update({
        where: { id: requirement.productId },
        data: { currentStock: { decrement: input.quantity } },
      });

      // El movimiento se crea ANTES que el Delivery para poder enlazar
      // movementId en un único INSERT (deliveries no admite UPDATE posterior).
      const movement = await tx.stockMovement.create({
        data: {
          productId: requirement.productId,
          type: 'EXIT',
          quantity: input.quantity,
          unitCost: avgCost,
          totalCost: input.quantity * avgCost,
          balanceAfter: newStock,
          reason: 'Entrega a producción',
          reference: 'delivery',
          userId,
        },
      });

      const delivery = await tx.delivery.create({
        data: {
          requirementId,
          quantity: input.quantity,
          source: input.source,
          readings: input.readings as Prisma.InputJsonValue,
          withinTolerance: evaluation.withinTolerance,
          approved: true,
          movementId: movement.id,
          deliveredById: userId,
        },
      });

      const newDelivered = round3(deliveredSoFar + input.quantity);
      const newStatus = recomputeRequirementStatus(newDelivered, required, tolerance);
      await tx.productionRequirement.update({
        where: { id: requirementId },
        data: { deliveredQuantity: newDelivered, status: newStatus },
      });

      // Transición de la orden (RF-04.5): primera entrega → IN_DELIVERY; todo entregado → DELIVERED.
      if (requirement.order.status === 'CONFIRMED') {
        assertTransition('CONFIRMED', 'IN_DELIVERY');
        await tx.productionOrder.update({ where: { id: orderId }, data: { status: 'IN_DELIVERY' } });
      }
      if (newStatus === 'DELIVERED') {
        const pendingCount = await tx.productionRequirement.count({
          where: { orderId, status: { not: 'DELIVERED' } },
        });
        if (pendingCount === 0) {
          assertTransition('IN_DELIVERY', 'DELIVERED');
          await tx.productionOrder.update({ where: { id: orderId }, data: { status: 'DELIVERED' } });
        }
      }

      return { delivery: toRecord(delivery), ...base };
    });
  }
}
