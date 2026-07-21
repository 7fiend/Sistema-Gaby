import { z } from 'zod';
import { paginationSchema } from './common.js';
import { AUDIT_KINDS } from '../types/enums.js';

/** Filtros de la bitácora (RF-13.1): usuario, tipo, rango; texto libre sobre acción/entidad. */
export const auditQuerySchema = paginationSchema.extend({
  userId: z.string().min(1).optional(),
  kind: z.enum(AUDIT_KINDS).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;

export interface AuditLogRecord {
  id: string;
  kind: (typeof AUDIT_KINDS)[number];
  userId: string | null;
  username: string | null;
  fullName: string | null;
  action: string;
  resource: string | null;
  resourceId: string | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
  createdAt: string;
}
