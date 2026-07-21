import type { MealTime, WeekDay } from '../types/enums.js';

/** Fase 18: etiquetas es-CO — único lugar que traduce estos enums para la UI. */
export const WEEK_DAY_LABELS: Record<WeekDay, string> = {
  MONDAY: 'Lunes',
  TUESDAY: 'Martes',
  WEDNESDAY: 'Miércoles',
  THURSDAY: 'Jueves',
  FRIDAY: 'Viernes',
  SATURDAY: 'Sábado',
  SUNDAY: 'Domingo',
};

export const MEAL_TIME_LABELS: Record<MealTime, string> = {
  BREAKFAST: 'Desayuno',
  MORNING_SNACK: 'Merienda (mañana)',
  LUNCH: 'Almuerzo',
  AFTERNOON_SNACK: 'Merienda (tarde)',
  DINNER: 'Cena',
};

/** Códigos de error estables (el frontend los mapea a mensajes en español). */
export const ERROR_CODES = {
  // Genéricos
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INTERNAL: 'INTERNAL',
  // Auth
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  // Negocio
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  OUT_OF_TOLERANCE: 'OUT_OF_TOLERANCE',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  IMMUTABLE_RECORD: 'IMMUTABLE_RECORD',
  RECIPE_IN_USE: 'RECIPE_IN_USE',
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Claves de configuración del sistema (tabla app_settings). */
export const SETTING_KEYS = {
  SCALE_TOLERANCE_KG: 'scale.toleranceKg',
  SCALE_STABLE_SAMPLES: 'scale.stableSamples',
  SCALE_STABLE_DELTA_KG: 'scale.stableDeltaKg',
  COSTING_DEFAULT_MARGIN_PCT: 'costing.defaultMarginPct',
  INVENTORY_EXPIRY_ALERT_DAYS: 'inventory.expiryAlertDays',
  AUTH_MAX_FAILED_ATTEMPTS: 'auth.maxFailedAttempts',
  AUTH_LOCK_MINUTES: 'auth.lockMinutes',
  BACKUP_SCHEDULE: 'backup.schedule',
  BACKUP_RETENTION_COUNT: 'backup.retentionCount',
} as const;

/** Valores por defecto (coinciden con el seed). */
export const DEFAULTS = {
  toleranceKg: 0.05,
  stableSamples: 5,
  stableDeltaKg: 0.005,
  marginPct: 60,
  expiryAlertDays: 5,
  pageSize: 25,
} as const;

export const API_PREFIX = '/api/v1';
