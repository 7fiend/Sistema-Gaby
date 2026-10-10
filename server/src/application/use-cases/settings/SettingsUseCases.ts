import {
  DEFAULTS,
  SETTING_KEYS,
  type AuthUser,
  type SettingsUpdateInput,
  type SettingsValues,
} from '@gaby/shared';
import type { ISettingsRepository } from '../../../domain/repositories/ISettingsRepository.js';
import type { IAuditLogger } from '../../ports/IAuditLogger.js';

/** Campo de la UI (camelCase) → clave persistida en app_settings. */
const KEY_MAP: Record<keyof SettingsValues, string> = {
  businessName: SETTING_KEYS.BUSINESS_NAME,
  businessNit: SETTING_KEYS.BUSINESS_NIT,
  toleranceKg: SETTING_KEYS.SCALE_TOLERANCE_KG,
  stableSamples: SETTING_KEYS.SCALE_STABLE_SAMPLES,
  stableDeltaKg: SETTING_KEYS.SCALE_STABLE_DELTA_KG,
  defaultMarginPct: SETTING_KEYS.COSTING_DEFAULT_MARGIN_PCT,
  expiryAlertDays: SETTING_KEYS.INVENTORY_EXPIRY_ALERT_DAYS,
  maxFailedAttempts: SETTING_KEYS.AUTH_MAX_FAILED_ATTEMPTS,
  lockMinutes: SETTING_KEYS.AUTH_LOCK_MINUTES,
  backupSchedule: SETTING_KEYS.BACKUP_SCHEDULE,
  backupRetentionCount: SETTING_KEYS.BACKUP_RETENTION_COUNT,
};

/** Defaults si la clave no existe aún en BD (coinciden con el seed). */
const FALLBACKS: SettingsValues = {
  businessName: '',
  businessNit: '',
  toleranceKg: DEFAULTS.toleranceKg,
  stableSamples: DEFAULTS.stableSamples,
  stableDeltaKg: DEFAULTS.stableDeltaKg,
  defaultMarginPct: DEFAULTS.marginPct,
  expiryAlertDays: DEFAULTS.expiryAlertDays,
  maxFailedAttempts: 5,
  lockMinutes: 15,
  backupSchedule: '0 2 * * *',
  backupRetentionCount: 14,
};

/** Configuración del sistema (RF-11): lectura y edición de app_settings. */
export class SettingsUseCases {
  constructor(
    private readonly settings: ISettingsRepository,
    private readonly audit: IAuditLogger,
  ) {}

  async get(): Promise<SettingsValues> {
    const raw = await this.settings.getAll();
    const entries = (Object.keys(KEY_MAP) as (keyof SettingsValues)[]).map((field) => {
      const value = raw[KEY_MAP[field]];
      const fallback = FALLBACKS[field];
      const valid = typeof value === typeof fallback ? value : fallback;
      return [field, valid] as const;
    });
    return Object.fromEntries(entries) as SettingsValues;
  }

  async update(input: SettingsUpdateInput, actor: AuthUser): Promise<SettingsValues> {
    const before = await this.get();

    const changed: Record<string, unknown> = {};
    for (const field of Object.keys(KEY_MAP) as (keyof SettingsValues)[]) {
      const value = input[field];
      if (value !== undefined && value !== before[field]) changed[KEY_MAP[field]] = value;
    }
    if (Object.keys(changed).length > 0) {
      await this.settings.setMany(changed);
      const after = await this.get();
      await this.audit.log({
        kind: 'CRUD',
        userId: actor.id,
        action: 'settings.update',
        resource: 'settings',
        before,
        after,
      });
      return after;
    }
    return before;
  }
}
