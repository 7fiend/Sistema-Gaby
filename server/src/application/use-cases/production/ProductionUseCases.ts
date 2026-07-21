import {
  DEFAULTS,
  SETTING_KEYS,
  SOCKET_ROOMS,
  type AuthUser,
  type ProductionCreateInput,
  type ProductionQuery,
  type ProductionStatus,
} from '@gaby/shared';
import type { IProductionRepository } from '../../../domain/repositories/IProductionRepository.js';
import type { ISettingsRepository } from '../../../domain/repositories/ISettingsRepository.js';
import { NotFoundError } from '../../../domain/errors/AppError.js';
import type { IAuditLogger } from '../../ports/IAuditLogger.js';
import type { IEventBus } from '../../ports/IEventBus.js';

const PRODUCTION_ROOMS = [SOCKET_ROOMS.ADMIN, SOCKET_ROOMS.INVENTORY, SOCKET_ROOMS.KITCHEN];

/** Casos de uso de producción diaria (agrupados por agregado, ver InventoryUseCases). */
export class ProductionUseCases {
  constructor(
    private readonly orders: IProductionRepository,
    private readonly settings: ISettingsRepository,
    private readonly audit: IAuditLogger,
    private readonly events: IEventBus,
  ) {}

  list(query: ProductionQuery) {
    return this.orders.list(query);
  }

  async get(id: string) {
    const order = await this.orders.findById(id);
    if (!order) throw new NotFoundError('Orden de producción', id);
    return order;
  }

  /** Explosión estimada + faltantes, para advertir ANTES de confirmar (RF-04.3). */
  availability(id: string) {
    return this.orders.availability(id);
  }

  async create(input: ProductionCreateInput, user: AuthUser) {
    const order = await this.orders.create(input, user.id);
    await this.audit.log({
      kind: 'PRODUCTION',
      userId: user.id,
      action: 'production.create',
      resource: 'production',
      resourceId: order.id,
      after: {
        orderNumber: order.orderNumber,
        date: order.date,
        items: input.items,
      },
    });
    return order;
  }

  /**
   * Confirmar orden: snapshots de costo + explosión consolidada + tolerancias
   * congeladas (todo atómico en el repositorio). Los faltantes se devuelven
   * como advertencia; el evento avisa a inventario y cocina.
   */
  async confirm(id: string, user: AuthUser) {
    const toleranceKg = await this.settings.getNumber(
      SETTING_KEYS.SCALE_TOLERANCE_KG,
      DEFAULTS.toleranceKg,
    );
    const { order, shortages } = await this.orders.confirm(id, toleranceKg);

    await this.audit.log({
      kind: 'PRODUCTION',
      userId: user.id,
      action: 'production.confirm',
      resource: 'production',
      resourceId: id,
      after: {
        orderNumber: order.orderNumber,
        totalCostSnapshot: order.totalCostSnapshot,
        requirements: order.requirements.length,
        shortages: shortages.map((s) => ({ productCode: s.productCode, missing: s.missing })),
      },
    });

    this.events.publish(
      'production:confirmed',
      { orderId: order.id, orderNumber: order.orderNumber, date: order.date.toISOString() },
      PRODUCTION_ROOMS,
    );
    return { order, shortages };
  }

  /** Transición manual (cancelar/cerrar); el repositorio valida la máquina de estados. */
  async transition(id: string, to: ProductionStatus, user: AuthUser) {
    const before = await this.get(id);
    const order = await this.orders.transition(id, to);

    await this.audit.log({
      kind: 'PRODUCTION',
      userId: user.id,
      action: `production.${to.toLowerCase()}`,
      resource: 'production',
      resourceId: id,
      before: { status: before.status },
      after: { status: to, orderNumber: order.orderNumber },
    });

    this.events.publish(
      'production:status-changed',
      { orderId: id, status: to },
      PRODUCTION_ROOMS,
    );
    return order;
  }
}
