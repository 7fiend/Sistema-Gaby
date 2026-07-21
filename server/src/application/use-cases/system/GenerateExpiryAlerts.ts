import { DEFAULTS, SETTING_KEYS, SOCKET_ROOMS } from '@gaby/shared';
import type { IProductRepository } from '../../../domain/repositories/IProductRepository.js';
import type { IAlertRepository } from '../../../domain/repositories/IAlertRepository.js';
import type { ISettingsRepository } from '../../../domain/repositories/ISettingsRepository.js';
import type { IAuditLogger } from '../../ports/IAuditLogger.js';
import type { IEventBus } from '../../ports/IEventBus.js';

const ALERT_TYPE = 'stock_expiring';

const dateFmt = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeZone: 'America/Bogota' });
const qtyFmt = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 });

/**
 * Cron diario de vencimientos (entrega 9c): genera una alerta `stock_expiring`
 * por cada lote con existencias que vence dentro de `inventory.expiryAlertDays`.
 * Idempotente: si el lote ya tiene una alerta NO leída, no la duplica
 * (marcarla leída y seguir venciendo la re-crea al día siguiente — a propósito).
 */
export class GenerateExpiryAlerts {
  constructor(
    private readonly products: IProductRepository,
    private readonly alerts: IAlertRepository,
    private readonly settings: ISettingsRepository,
    private readonly audit: IAuditLogger,
    private readonly events: IEventBus,
  ) {}

  /** Devuelve cuántas alertas nuevas creó. */
  async execute(): Promise<number> {
    const days = await this.settings.getNumber(
      SETTING_KEYS.INVENTORY_EXPIRY_ALERT_DAYS,
      DEFAULTS.expiryAlertDays,
    );
    const before = new Date(Date.now() + days * 24 * 3600 * 1000);

    const [batches, unread] = await Promise.all([
      this.products.findExpiringBatches(before),
      this.alerts.listUnreadByType(ALERT_TYPE),
    ]);
    const alreadyAlerted = new Set(
      unread.map((a) => (a.data as { batchId?: string } | null)?.batchId).filter(Boolean),
    );

    let created = 0;
    for (const batch of batches) {
      if (alreadyAlerted.has(batch.batchId)) continue;
      const alert = await this.alerts.create(
        ALERT_TYPE,
        `Vence pronto: ${batch.productName} — lote ${batch.batchNumber} ` +
          `(${qtyFmt.format(batch.remainingQuantity)} ${batch.unitAbbreviation}) ` +
          `vence el ${dateFmt.format(batch.expiryDate)}`,
        { productId: batch.productId, batchId: batch.batchId, expiryDate: batch.expiryDate },
      );
      this.events.publish(
        'stock:expiring',
        {
          productId: batch.productId,
          batchId: batch.batchId,
          expiryDate: batch.expiryDate.toISOString(),
        },
        [SOCKET_ROOMS.ADMIN, SOCKET_ROOMS.INVENTORY],
      );
      this.events.publish(
        'alert:new',
        { alertId: alert.id, type: ALERT_TYPE, message: alert.message },
        [SOCKET_ROOMS.ADMIN],
      );
      created++;
    }

    if (created > 0) {
      await this.audit.log({
        kind: 'SYSTEM',
        action: 'inventory.expiry-scan',
        resource: 'alerts',
        metadata: { created, days, scannedBatches: batches.length },
      });
    }
    return created;
  }
}
