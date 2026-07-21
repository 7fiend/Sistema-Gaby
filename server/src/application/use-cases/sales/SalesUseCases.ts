import {
  SOCKET_ROOMS,
  type AuthUser,
  type SaleRecordInput,
  type SalesQuery,
} from '@gaby/shared';
import type { ISaleRepository } from '../../../domain/repositories/ISaleRepository.js';
import type { IAuditLogger } from '../../ports/IAuditLogger.js';
import type { IEventBus } from '../../ports/IEventBus.js';

/** Casos de uso de ventas: registro consolidado diario (decisión cliente §6.1). */
export class SalesUseCases {
  constructor(
    private readonly sales: ISaleRepository,
    private readonly audit: IAuditLogger,
    private readonly events: IEventBus,
  ) {}

  list(query: SalesQuery) {
    return this.sales.list(query);
  }

  /** Registro de un día (null si aún no hay captura — la UI lo usa para decidir). */
  getByDate(date: Date) {
    return this.sales.findByDate(date);
  }

  async register(input: SaleRecordInput, user: AuthUser) {
    const record = await this.sales.create(input, user.id);
    await this.audit.log({
      kind: 'CRUD',
      userId: user.id,
      action: 'sales.register',
      resource: 'sales',
      resourceId: record.id,
      after: {
        date: record.date,
        totalPortions: record.totalPortions,
        totalAmount: record.totalAmount,
        items: record.items.length,
      },
    });
    this.events.publish(
      'sales:registered',
      { saleRecordId: record.id, date: record.date.toISOString() },
      [SOCKET_ROOMS.ADMIN],
    );
    return record;
  }
}
