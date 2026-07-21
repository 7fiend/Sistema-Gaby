import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, TriangleAlert, XCircle } from 'lucide-react';
import { ApiRequestError } from '@/lib/api';
import { formatCOP, formatDateOnly, formatQty } from '@/lib/utils';
import { productionApi, type AvailabilityLine } from './api';
import { REQUIREMENT_BADGE, REQUIREMENT_LABELS, STATUS_BADGE, STATUS_LABELS } from './status';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function AvailabilityTable({ lines }: { lines: AvailabilityLine[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-1.5 pr-2 font-medium">Producto</th>
            <th className="py-1.5 pr-2 text-right font-medium">Requerido</th>
            <th className="py-1.5 pr-2 text-right font-medium">Disponible</th>
            <th className="py-1.5 text-right font-medium">Faltante</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.productId} className="border-b last:border-0">
              <td className="py-1.5 pr-2">
                {l.productName} <span className="text-xs text-muted-foreground">({l.productCode})</span>
              </td>
              <td className="tnum py-1.5 pr-2 text-right">
                {formatQty(l.required)} {l.unitAbbreviation}
              </td>
              <td className="tnum py-1.5 pr-2 text-right text-muted-foreground">
                {formatQty(l.available)} {l.unitAbbreviation}
              </td>
              <td className="tnum py-1.5 text-right">
                {l.missing > 0 ? (
                  <span className="inline-flex items-center gap-1 font-medium text-destructive">
                    <TriangleAlert className="size-3.5" /> {formatQty(l.missing)} {l.unitAbbreviation}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ProductionDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const { data: order, isLoading } = useQuery({
    queryKey: ['production', id],
    queryFn: () => productionApi.get(id),
  });

  const showAvailability =
    order && ['DRAFT', 'CONFIRMED', 'IN_DELIVERY'].includes(order.status);
  const { data: availability } = useQuery({
    queryKey: ['production', id, 'availability'],
    queryFn: () => productionApi.availability(id),
    enabled: !!showAvailability,
  });
  const shortages = availability?.filter((l) => l.missing > 0) ?? [];

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['production'] });
  };

  const confirmMutation = useMutation({
    mutationFn: () => productionApi.confirm(id),
    onSuccess: ({ order: confirmed, shortages: missing }) => {
      invalidate();
      setConfirmOpen(false);
      if (missing.length > 0) {
        toast.warning(
          `Orden ${confirmed.orderNumber} confirmada con ${missing.length} faltante${missing.length > 1 ? 's' : ''}: ` +
            missing.map((m) => m.productName).join(', '),
        );
      } else {
        toast.success(`Orden ${confirmed.orderNumber} confirmada — insumos listos para bodega`);
      }
    },
    onError: (e) =>
      toast.error(e instanceof ApiRequestError ? e.message : 'Error al confirmar la orden'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => productionApi.cancel(id),
    onSuccess: () => {
      invalidate();
      setCancelOpen(false);
      toast.success('Orden cancelada');
    },
    onError: (e) =>
      toast.error(e instanceof ApiRequestError ? e.message : 'Error al cancelar la orden'),
  });

  const closeMutation = useMutation({
    mutationFn: () => productionApi.close(id),
    onSuccess: () => {
      invalidate();
      toast.success('Orden cerrada');
    },
    onError: (e) =>
      toast.error(e instanceof ApiRequestError ? e.message : 'Error al cerrar la orden'),
  });

  const startMutation = useMutation({
    mutationFn: () => productionApi.start(id),
    onSuccess: () => {
      invalidate();
      toast.success('Preparación iniciada');
    },
    onError: (e) =>
      toast.error(e instanceof ApiRequestError ? e.message : 'Error al iniciar preparación'),
  });

  const completeMutation = useMutation({
    mutationFn: () => productionApi.complete(id),
    onSuccess: () => {
      invalidate();
      toast.success('Producción completada');
    },
    onError: (e) =>
      toast.error(e instanceof ApiRequestError ? e.message : 'Error al completar la producción'),
  });

  if (isLoading || !order) {
    return <p className="text-sm text-muted-foreground">Cargando orden…</p>;
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/produccion')} aria-label="Volver">
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2.5">
            <h1 className="tnum text-xl font-semibold">{order.orderNumber}</h1>
            <Badge variant="outline" className={STATUS_BADGE[order.status]}>
              {STATUS_LABELS[order.status]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Producción del {formatDateOnly(order.date)} · creada por {order.createdBy}
            {order.confirmedAt && ` · confirmada el ${formatDateOnly(order.confirmedAt)}`}
          </p>
        </div>
        <div className="flex gap-2">
          {order.status === 'DRAFT' && (
            <Button onClick={() => setConfirmOpen(true)}>
              <CheckCircle2 className="size-4" /> Confirmar orden
            </Button>
          )}
          {(order.status === 'DRAFT' || order.status === 'CONFIRMED') && (
            <Button variant="outline" className="text-destructive" onClick={() => setCancelOpen(true)}>
              <XCircle className="size-4" /> Cancelar orden
            </Button>
          )}
          {order.status === 'DELIVERED' && (
            <Button onClick={() => startMutation.mutate()} disabled={startMutation.isPending}>
              Iniciar preparación
            </Button>
          )}
          {order.status === 'IN_PREPARATION' && (
            <Button onClick={() => completeMutation.mutate()} disabled={completeMutation.isPending}>
              Marcar completada
            </Button>
          )}
          {order.status === 'COMPLETED' && (
            <Button onClick={() => closeMutation.mutate()} disabled={closeMutation.isPending}>
              Cerrar orden
            </Button>
          )}
        </div>
      </div>

      {order.notes && (
        <p className="mb-4 rounded-lg border bg-card px-4 py-2.5 text-sm text-muted-foreground">{order.notes}</p>
      )}

      <div className="mb-5 grid grid-cols-3 gap-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Recetas</p>
          <p className="tnum text-lg font-semibold">{order.recipesCount}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Porciones</p>
          <p className="tnum text-lg font-semibold">{order.totalPortions}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {order.status === 'DRAFT' ? 'Costo (se congela al confirmar)' : 'Costo congelado'}
          </p>
          <p className="tnum text-lg font-semibold">
            {order.status === 'DRAFT' ? '—' : formatCOP(order.totalCostSnapshot)}
          </p>
        </div>
      </div>

      <section className="mb-5 rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Recetas de la orden</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-1.5 pr-2 font-medium">Receta</th>
                <th className="py-1.5 pr-2 text-right font-medium">Versión</th>
                <th className="py-1.5 pr-2 text-right font-medium">Porciones</th>
                <th className="py-1.5 pr-2 text-right font-medium">Costo/porción</th>
                <th className="py-1.5 text-right font-medium">Costo total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((i) => (
                <tr key={i.id} className="border-b last:border-0">
                  <td className="py-1.5 pr-2">{i.recipeName}</td>
                  <td className="tnum py-1.5 pr-2 text-right text-muted-foreground">v{i.versionNumber}</td>
                  <td className="tnum py-1.5 pr-2 text-right">{i.portions}</td>
                  <td className="tnum py-1.5 pr-2 text-right">
                    {order.status === 'DRAFT' ? '—' : formatCOP(i.costPerPortionSnapshot)}
                  </td>
                  <td className="tnum py-1.5 text-right">
                    {order.status === 'DRAFT' ? '—' : formatCOP(i.totalCostSnapshot)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showAvailability && availability && availability.length > 0 && (
        <section className="mb-5 rounded-lg border bg-card p-4">
          <h2 className="mb-1 text-sm font-semibold">
            {order.status === 'DRAFT' ? 'Explosión estimada de insumos' : 'Disponibilidad de lo pendiente'}
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            {order.status === 'DRAFT'
              ? 'Calculada con las versiones vigentes de las recetas; se congela al confirmar.'
              : 'Cantidades pendientes de entrega comparadas con el stock actual.'}
          </p>
          <AvailabilityTable lines={availability} />
        </section>
      )}

      {order.requirements.length > 0 && (
        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Insumos a entregar (congelados al confirmar)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-1.5 pr-2 font-medium">Producto</th>
                  <th className="py-1.5 pr-2 text-right font-medium">Requerido</th>
                  <th className="py-1.5 pr-2 text-right font-medium">Entregado</th>
                  <th className="py-1.5 pr-2 text-right font-medium">Tolerancia</th>
                  <th className="py-1.5 text-right font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {order.requirements.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-1.5 pr-2">
                      {r.productName} <span className="text-xs text-muted-foreground">({r.productCode})</span>
                    </td>
                    <td className="tnum py-1.5 pr-2 text-right">
                      {formatQty(r.requiredQuantity)} {r.unitAbbreviation}
                    </td>
                    <td className="tnum py-1.5 pr-2 text-right">
                      {formatQty(r.deliveredQuantity)} {r.unitAbbreviation}
                    </td>
                    <td className="tnum py-1.5 pr-2 text-right text-muted-foreground">
                      ±{formatQty(r.toleranceApplied)} kg
                    </td>
                    <td className="py-1.5 text-right">
                      <Badge variant="outline" className={REQUIREMENT_BADGE[r.status]}>
                        {REQUIREMENT_LABELS[r.status]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Confirmación fuerte (Fase 4 §4): resumen + faltantes antes de congelar */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar {order.orderNumber}</DialogTitle>
            <DialogDescription>
              Se congelarán los costos de {order.recipesCount} receta{order.recipesCount > 1 ? 's' : ''} (
              {order.totalPortions} porciones) y se generará la lista de insumos para bodega. Esta acción
              no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          {shortages.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <p className="mb-1.5 flex items-center gap-1.5 font-medium text-destructive">
                <TriangleAlert className="size-4" /> Stock insuficiente para {shortages.length} insumo
                {shortages.length > 1 ? 's' : ''}
              </p>
              <ul className="flex flex-col gap-0.5 text-destructive/90">
                {shortages.map((s) => (
                  <li key={s.productId} className="tnum">
                    {s.productName}: faltan {formatQty(s.missing)} {s.unitAbbreviation}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Puedes confirmar de todas formas y registrar entradas de inventario antes de entregar.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Volver
            </Button>
            <Button onClick={() => confirmMutation.mutate()} disabled={confirmMutation.isPending}>
              Confirmar producción
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar {order.orderNumber}</DialogTitle>
            <DialogDescription>
              La orden quedará cancelada de forma permanente. Solo es posible mientras no tenga
              entregas registradas.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Volver
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
            >
              Cancelar orden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
