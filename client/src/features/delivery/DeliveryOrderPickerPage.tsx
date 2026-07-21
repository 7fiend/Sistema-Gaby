import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Scale, SprayCan, LogOut } from 'lucide-react';
import { deliveryApi } from './api';
import { STATUS_BADGE, STATUS_LABELS } from '@/features/production/status';
import { formatDateOnly } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { logout } from '@/features/auth/api';

/** Selector de orden activa (sin sidebar, mockup §3.2). Auto-avanza si solo hay una. */
export function DeliveryOrderPickerPage() {
  const navigate = useNavigate();
  const { data: orders, isLoading } = useQuery({
    queryKey: ['production', 'active-for-delivery'],
    queryFn: deliveryApi.listActive,
    refetchInterval: 15_000,
  });

  useEffect(() => {
    if (orders && orders.length === 1) {
      navigate(`/bodega/${orders[0]!.id}`, { replace: true });
    }
  }, [orders, navigate]);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center gap-3 border-b bg-card px-6 py-4">
        <Scale className="size-5 text-primary" />
        <h1 className="text-lg font-semibold">Órdenes con entrega pendiente</h1>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => navigate('/bodega/rutina-aseo')}
        >
          <SprayCan className="size-4" /> Rutina de aseo
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void logout()}>
          <LogOut className="size-4" /> Salir
        </Button>
      </header>
      <div className="flex-1 p-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando órdenes…</p>
        ) : !orders || orders.length === 0 ? (
          <div className="grid h-full place-items-center">
            <p className="rounded-lg border border-dashed px-10 py-8 text-sm text-muted-foreground">
              No hay órdenes confirmadas pendientes de entrega en este momento.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {orders.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => navigate(`/bodega/${o.id}`)}
                className="flex flex-col gap-2 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary"
              >
                <div className="flex items-center gap-2">
                  <span className="tnum text-base font-semibold">{o.orderNumber}</span>
                  <Badge variant="outline" className={STATUS_BADGE[o.status]}>
                    {STATUS_LABELS[o.status]}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {formatDateOnly(o.date)} · {o.recipesCount} receta{o.recipesCount > 1 ? 's' : ''} ·{' '}
                  {o.totalPortions} porciones
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
