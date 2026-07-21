import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AuditKind, AuditLogRecord } from '@gaby/shared';
import { AUDIT_KIND_LABELS, auditApi } from './api';
import { usersApi } from '@/features/users/api';
import { formatDateTime } from '@/lib/utils';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const KIND_OPTIONS: AuditKind[] = ['AUTH', 'CRUD', 'INVENTORY', 'PRODUCTION', 'SECURITY', 'SYSTEM', 'ERROR'];

function kindBadge(kind: AuditKind) {
  const variant = kind === 'SECURITY' || kind === 'ERROR' ? 'destructive' : 'outline';
  return <Badge variant={variant}>{AUDIT_KIND_LABELS[kind]}</Badge>;
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <pre className="max-h-80 overflow-auto rounded-md border bg-muted/40 p-3 text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function DetailDialog({ entry, onOpenChange }: { entry: AuditLogRecord | null; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{entry?.action}</DialogTitle>
        </DialogHeader>
        {entry && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <p className="text-muted-foreground">Tipo</p>
              <p>{kindBadge(entry.kind)}</p>
              <p className="text-muted-foreground">Usuario</p>
              <p>{entry.fullName ?? 'Sistema'}</p>
              <p className="text-muted-foreground">Entidad</p>
              <p>
                {entry.resource ?? '—'}
                {entry.resourceId ? ` · ${entry.resourceId}` : ''}
              </p>
              <p className="text-muted-foreground">Fecha</p>
              <p className="tnum">{formatDateTime(entry.createdAt)}</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <JsonBlock title="Estado previo" value={entry.before} />
              <JsonBlock title="Estado posterior" value={entry.after} />
            </div>
            <JsonBlock title="Metadatos" value={entry.metadata} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [userId, setUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState<AuditLogRecord | null>(null);

  const { data: users } = useQuery({
    queryKey: ['users', 'for-audit-filter'],
    queryFn: () => usersApi.list({ page: 1, includeInactive: true }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['audit', { page, search, kind, userId, from, to }],
    queryFn: () =>
      auditApi.list({
        page,
        search: search || undefined,
        kind: (kind || undefined) as AuditKind | undefined,
        userId: userId || undefined,
        from: from || undefined,
        to: to || undefined,
      }),
  });

  const columns: Column<AuditLogRecord>[] = [
    {
      header: 'Fecha',
      cell: (r) => <span className="tnum text-muted-foreground">{formatDateTime(r.createdAt)}</span>,
    },
    { header: 'Usuario', cell: (r) => r.fullName ?? 'Sistema' },
    { header: 'Tipo', cell: (r) => kindBadge(r.kind) },
    { header: 'Acción', cell: (r) => r.action },
    {
      header: 'Entidad',
      cell: (r) => (
        <span className="text-muted-foreground">
          {r.resource ?? '—'}
          {r.resourceId ? ` · ${r.resourceId}` : ''}
        </span>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Auditoría</h1>
        <p className="text-sm text-muted-foreground">
          Bitácora del sistema. Toca un registro para ver el detalle antes/después.
        </p>
      </div>

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        page={page}
        onPageChange={setPage}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por acción o entidad…"
        onRowClick={setSelected}
        emptyMessage="No hay registros para estos filtros"
        toolbar={
          <>
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Todos los tipos</option>
              {KIND_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {AUDIT_KIND_LABELS[k]}
                </option>
              ))}
            </select>
            <select
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Todos los usuarios</option>
              {users?.items.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            />
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            />
          </>
        }
      />

      <DetailDialog entry={selected} onOpenChange={(o) => !o && setSelected(null)} />
    </div>
  );
}
