import type { AuditKind } from '@gaby/shared';

export interface AuditEntry {
  kind: AuditKind;
  userId?: string | null;
  action: string;
  resource?: string;
  resourceId?: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

/**
 * Puerto de auditoría (RN-07). Append-only: no existe forma de editar
 * ni borrar (los triggers de BD lo refuerzan). El registro nunca debe
 * tumbar la operación principal: implementaciones capturan sus errores.
 */
export interface IAuditLogger {
  log(entry: AuditEntry): Promise<void>;
}
