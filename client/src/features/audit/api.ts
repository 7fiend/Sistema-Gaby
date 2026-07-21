import type { AuditKind, AuditLogRecord, Paginated } from '@gaby/shared';
import { api } from '@/lib/api';

export const AUDIT_KIND_LABELS: Record<AuditKind, string> = {
  AUTH: 'Autenticación',
  CRUD: 'Cambios de datos',
  INVENTORY: 'Inventario',
  PRODUCTION: 'Producción',
  SECURITY: 'Seguridad',
  SYSTEM: 'Sistema',
  ERROR: 'Error',
};

function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

export const auditApi = {
  list: (params: {
    page: number;
    userId?: string;
    kind?: AuditKind;
    from?: string;
    to?: string;
    search?: string;
  }) => api.get<Paginated<AuditLogRecord>>(`/audit${qs(params)}`),
};
