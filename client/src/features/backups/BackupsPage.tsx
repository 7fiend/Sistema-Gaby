import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';
import { AlertTriangle, Download, RotateCcw, Save } from 'lucide-react';
import { RESTORE_CONFIRMATION_WORD, type BackupRecord } from '@gaby/shared';
import { ApiRequestError } from '@/lib/api';
import { formatBytes, formatDateTime } from '@/lib/utils';
import { BACKUP_TYPE_LABELS, backupsApi } from './api';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function errorToast(e: unknown, fallback: string) {
  toast.error(e instanceof ApiRequestError ? e.message : fallback);
}

function statusBadge(status: BackupRecord['status']) {
  if (status === 'COMPLETED') return <Badge variant="secondary">Completado</Badge>;
  if (status === 'FAILED') return <Badge variant="destructive">Falló</Badge>;
  return <Badge variant="outline">En curso…</Badge>;
}

/** Réplica local de backupRestoreSchema con mensaje editable en el input (z.literal complica el tipo del defaultValue vacío en RHF); el servidor revalida la misma palabra desde backupRestoreSchema. */
const restoreFormSchema = z.object({
  // Retorno anotado como boolean a propósito: sin esto TS 5.5+ infiere un type
  // predicate de la comparación y `confirmation` queda tipado como el literal
  // "RESTAURAR" en vez de string, rompiendo el defaultValue vacío del input.
  confirmation: z.string().refine((v): boolean => v === RESTORE_CONFIRMATION_WORD, {
    message: `Escribe "${RESTORE_CONFIRMATION_WORD}" para confirmar`,
  }),
});
type RestoreFormInput = z.infer<typeof restoreFormSchema>;

function RestoreDialog({
  backup,
  onOpenChange,
}: {
  backup: BackupRecord | null;
  onOpenChange: (o: boolean) => void;
}) {
  const form = useForm<RestoreFormInput>({
    resolver: zodResolver(restoreFormSchema),
    values: { confirmation: '' },
  });
  const mutation = useMutation({
    mutationFn: (v: RestoreFormInput) => backupsApi.restore(backup!.id, v.confirmation),
    onSuccess: () => {
      toast.success('Base de datos restaurada. Vuelve a iniciar sesión si es necesario.');
      onOpenChange(false);
      form.reset();
    },
    onError: (e) => errorToast(e, 'No se pudo restaurar el respaldo'),
  });
  const { errors } = form.formState;

  return (
    <Dialog open={backup !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Restaurar respaldo</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <p>
              Esto reemplaza <strong>todos</strong> los datos actuales por los del respaldo{' '}
              <span className="tnum">{backup ? formatDateTime(backup.createdAt) : ''}</span>. No se
              puede deshacer, y las sesiones abiertas después del respaldo se cerrarán.
            </p>
          </div>
          <form
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="flex flex-col gap-3"
            noValidate
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="restore-confirm">
                Escribe <span className="font-mono font-semibold">{RESTORE_CONFIRMATION_WORD}</span>{' '}
                para confirmar
              </Label>
              <Input id="restore-confirm" autoFocus autoComplete="off" {...form.register('confirmation')} />
              {errors.confirmation && (
                <p className="text-xs text-destructive">{errors.confirmation.message}</p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="destructive" disabled={mutation.isPending}>
                Restaurar
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function BackupsPage() {
  const [page, setPage] = useState(1);
  const [restoring, setRestoring] = useState<BackupRecord | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['backups', { page }],
    queryFn: () => backupsApi.list({ page }),
  });

  const createMutation = useMutation({
    mutationFn: () => backupsApi.create(),
    onSuccess: (b) => {
      void queryClient.invalidateQueries({ queryKey: ['backups'] });
      if (b.status === 'FAILED') {
        toast.error(`El respaldo falló: ${b.error ?? 'error desconocido'}`);
      } else {
        toast.success('Respaldo creado');
      }
    },
    onError: (e) => errorToast(e, 'No se pudo crear el respaldo'),
  });

  const columns: Column<BackupRecord>[] = [
    {
      header: 'Fecha',
      cell: (b) => <span className="tnum text-muted-foreground">{formatDateTime(b.createdAt)}</span>,
    },
    { header: 'Tipo', cell: (b) => BACKUP_TYPE_LABELS[b.type] },
    { header: 'Estado', cell: (b) => statusBadge(b.status) },
    {
      header: 'Tamaño',
      cell: (b) => <span className="tnum">{b.status === 'COMPLETED' ? formatBytes(b.sizeBytes) : '—'}</span>,
    },
    { header: 'Creado por', cell: (b) => b.createdBy ?? 'Sistema (programado)' },
    {
      header: '',
      cell: (b) =>
        b.status === 'COMPLETED' && (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={() => void backupsApi.download(b.id)}>
              <Download className="size-4" /> Descargar
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRestoring(b)}>
              <RotateCcw className="size-4" /> Restaurar
            </Button>
          </div>
        ),
      className: 'text-right',
    },
  ];

  return (
    <div>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">Respaldos</h1>
          <p className="text-sm text-muted-foreground">
            Copias de la base de datos. El respaldo programado corre según el horario de
            Configuración → Respaldos.
          </p>
        </div>
        <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
          <Save className="size-4" /> Respaldar ahora
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        page={page}
        onPageChange={setPage}
        emptyMessage="Aún no hay respaldos"
      />

      <RestoreDialog backup={restoring} onOpenChange={(o) => !o && setRestoring(null)} />
    </div>
  );
}
