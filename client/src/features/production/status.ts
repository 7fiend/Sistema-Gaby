import type { ProductionStatus, RequirementStatus } from '@gaby/shared';

export const STATUS_LABELS: Record<ProductionStatus, string> = {
  DRAFT: 'Borrador',
  CONFIRMED: 'Confirmada',
  IN_DELIVERY: 'En entrega',
  DELIVERED: 'Entregada',
  IN_PREPARATION: 'En preparación',
  COMPLETED: 'Completada',
  CLOSED: 'Cerrada',
  CANCELLED: 'Cancelada',
};

/** Clases del badge de estado (tokens Fase 4). */
export const STATUS_BADGE: Record<ProductionStatus, string> = {
  DRAFT: 'border-border bg-secondary text-secondary-foreground',
  CONFIRMED: 'border-primary/40 bg-primary/10 text-primary',
  IN_DELIVERY: 'border-warning/40 bg-warning/10 text-warning',
  DELIVERED: 'border-primary/40 bg-primary/10 text-primary',
  IN_PREPARATION: 'border-warning/40 bg-warning/10 text-warning',
  COMPLETED: 'border-primary/40 bg-primary/10 text-primary',
  CLOSED: 'border-border bg-muted text-muted-foreground',
  CANCELLED: 'border-destructive/40 bg-destructive/10 text-destructive',
};

export const REQUIREMENT_LABELS: Record<RequirementStatus, string> = {
  PENDING: 'Pendiente',
  PARTIAL: 'Parcial',
  DELIVERED: 'Entregado',
  BLOCKED: 'Bloqueado',
};

export const REQUIREMENT_BADGE: Record<RequirementStatus, string> = {
  PENDING: 'border-border bg-secondary text-secondary-foreground',
  PARTIAL: 'border-warning/40 bg-warning/10 text-warning',
  DELIVERED: 'border-primary/40 bg-primary/10 text-primary',
  BLOCKED: 'border-destructive/40 bg-destructive/10 text-destructive',
};
