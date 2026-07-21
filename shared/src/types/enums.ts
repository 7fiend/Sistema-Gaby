/**
 * Enums de dominio — espejo 1:1 de los enums de schema.prisma.
 * Fuente única para frontend y backend (el cliente no depende de Prisma).
 */

export const PRODUCTION_STATUS = [
  'DRAFT',
  'CONFIRMED',
  'IN_DELIVERY',
  'DELIVERED',
  'IN_PREPARATION',
  'COMPLETED',
  'CLOSED',
  'CANCELLED',
] as const;
export type ProductionStatus = (typeof PRODUCTION_STATUS)[number];

/** Transiciones válidas del ciclo de vida (RF-04.5). */
export const PRODUCTION_TRANSITIONS: Record<ProductionStatus, ProductionStatus[]> = {
  DRAFT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['IN_DELIVERY', 'CANCELLED'],
  IN_DELIVERY: ['DELIVERED'],
  DELIVERED: ['IN_PREPARATION'],
  IN_PREPARATION: ['COMPLETED'],
  COMPLETED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

export const REQUIREMENT_STATUS = ['PENDING', 'PARTIAL', 'DELIVERED', 'BLOCKED'] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUS)[number];

export const MOVEMENT_TYPES = [
  'ENTRY',
  'EXIT',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'WASTE',
  'LOSS',
  'EXPIRY',
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

/** Tipos que suman stock; el resto restan. */
export const INBOUND_MOVEMENTS: MovementType[] = ['ENTRY', 'ADJUSTMENT_IN'];

export const CATEGORY_KINDS = ['PRODUCT', 'RECIPE', 'EXPENSE'] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const UNIT_KINDS = ['WEIGHT', 'VOLUME', 'COUNT'] as const;
export type UnitKind = (typeof UNIT_KINDS)[number];

export const WEIGHT_SOURCES = ['SCALE', 'SIMULATOR', 'COUNT'] as const;
export type WeightSource = (typeof WEIGHT_SOURCES)[number];

export const AUDIT_KINDS = [
  'AUTH',
  'CRUD',
  'INVENTORY',
  'PRODUCTION',
  'SECURITY',
  'SYSTEM',
  'ERROR',
] as const;
export type AuditKind = (typeof AUDIT_KINDS)[number];

export const SYSTEM_ROLES = ['ADMIN', 'INVENTORY', 'KITCHEN', 'AUDITOR'] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

export const REPORT_FORMATS = ['PDF', 'XLSX', 'CSV'] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

export const BACKUP_TYPES = ['MANUAL', 'SCHEDULED'] as const;
export type BackupType = (typeof BACKUP_TYPES)[number];

export const BACKUP_STATUSES = ['RUNNING', 'COMPLETED', 'FAILED'] as const;
export type BackupStatus = (typeof BACKUP_STATUSES)[number];

/** Fase 18: día de la semana del menú programado. */
export const WEEK_DAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

/** Fase 18: tiempos de comida fijos del día, en orden (dos meriendas). */
export const MEAL_TIMES = [
  'BREAKFAST',
  'MORNING_SNACK',
  'LUNCH',
  'AFTERNOON_SNACK',
  'DINNER',
] as const;
export type MealTime = (typeof MEAL_TIMES)[number];

/** Fase 18: RECIPE se descuenta por producción/báscula; ROUTINE por registro manual diario. */
export const PRODUCT_USAGE_TYPES = ['RECIPE', 'ROUTINE'] as const;
export type ProductUsageType = (typeof PRODUCT_USAGE_TYPES)[number];
