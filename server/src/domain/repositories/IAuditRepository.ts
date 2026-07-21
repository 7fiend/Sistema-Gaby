import type { AuditKind, AuditQuery, Paginated } from '@gaby/shared';

export interface AuditLogRow {
  id: string;
  kind: AuditKind;
  userId: string | null;
  username: string | null;
  fullName: string | null;
  action: string;
  resource: string | null;
  resourceId: string | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
  createdAt: Date;
}

/** Lectura de la bitácora de auditoría (RF-13.1) — el registro en sí es solo-escritura vía IAuditLogger. */
export interface IAuditRepository {
  list(query: AuditQuery): Promise<Paginated<AuditLogRow>>;
}
