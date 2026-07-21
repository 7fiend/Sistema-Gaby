import { CheckCircle2, Circle, TriangleAlert } from 'lucide-react';
import type { RequirementStatus } from '@gaby/shared';

/** Ícono por estado del requirement (mockup §3.2: ✔ entregado, ⚠ parcial/bloqueado, ○ pendiente). */
export const REQUIREMENT_ICON: Record<RequirementStatus, typeof CheckCircle2> = {
  DELIVERED: CheckCircle2,
  PARTIAL: TriangleAlert,
  BLOCKED: TriangleAlert,
  PENDING: Circle,
};

export const REQUIREMENT_ICON_CLASS: Record<RequirementStatus, string> = {
  DELIVERED: 'text-primary',
  PARTIAL: 'text-warning',
  BLOCKED: 'text-destructive',
  PENDING: 'text-muted-foreground',
};
