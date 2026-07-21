import { SOCKET_ROOMS, type AuthUser, type DeliveryRegisterInput } from '@gaby/shared';
import type { IDeliveryRepository } from '../../../domain/repositories/IDeliveryRepository.js';
import type { IAlertRepository } from '../../../domain/repositories/IAlertRepository.js';
import type { IAuditLogger } from '../../ports/IAuditLogger.js';
import type { IEventBus } from '../../ports/IEventBus.js';
import type { ProductionUseCases } from '../production/ProductionUseCases.js';

/** Casos de uso de entregas por báscula (RF-05), módulo Bodega — Fase 10. */
export class DeliveryUseCases {
  constructor(
    private readonly deliveries: IDeliveryRepository,
    private readonly production: ProductionUseCases,
    private readonly alerts: IAlertRepository,
    private readonly audit: IAuditLogger,
    private readonly events: IEventBus,
  ) {}

  async register(orderId: string, requirementId: string, input: DeliveryRegisterInput, user: AuthUser) {
    const result = await this.deliveries.register(orderId, requirementId, input, user.id);

    await this.audit.log({
      kind: result.approved ? 'PRODUCTION' : 'SECURITY',
      userId: user.id,
      action: result.approved ? 'delivery.register' : 'delivery.blocked',
      resource: 'delivery',
      resourceId: result.delivery.id,
      after: {
        orderId,
        requirementId,
        ...input,
        approved: result.approved,
        withinTolerance: result.withinTolerance,
        deltaKg: result.deltaKg,
      },
    });

    const order = await this.production.get(orderId);

    if (result.approved) {
      this.events.publish(
        'delivery:completed',
        { orderId, requirementId, productId: result.productId },
        [SOCKET_ROOMS.ADMIN, SOCKET_ROOMS.INVENTORY, SOCKET_ROOMS.KITCHEN],
      );
    } else {
      await this.alerts.create(
        'delivery_blocked',
        `Entrega bloqueada: ${result.productName} — ${
          result.deltaKg > 0 ? 'sobran' : 'faltan'
        } ${Math.abs(result.deltaKg)} kg (orden ${result.orderNumber})`,
        { orderId, requirementId, productId: result.productId, deltaKg: result.deltaKg },
      );
      this.events.publish(
        'delivery:blocked',
        { orderId, requirementId, productId: result.productId, deltaKg: result.deltaKg },
        [SOCKET_ROOMS.ADMIN, SOCKET_ROOMS.INVENTORY],
      );
    }

    return {
      order,
      delivery: result.delivery,
      approved: result.approved,
      withinTolerance: result.withinTolerance,
      deltaKg: result.deltaKg,
    };
  }
}
