import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Scale } from 'lucide-react';
import { DEFAULTS } from '@gaby/shared';
import { productionApi, type Requirement } from '@/features/production/api';
import { settingsApi } from '@/features/settings/api';
import { REQUIREMENT_ICON, REQUIREMENT_ICON_CLASS } from './status';
import { DeliveryWeighPanel } from './DeliveryWeighPanel';
import { ScaleService } from '@/services/scale/ScaleService';
import { SimulatorDriver } from '@/services/scale/SimulatorDriver';
import { SimulatorPanel } from '@/services/scale/SimulatorPanel';
import { formatQty, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const IS_SIMULATOR = import.meta.env.VITE_SCALE_DRIVER === 'simulator';

const SCALE_STATUS_LABEL: Record<string, string> = {
  connected: 'conectada',
  connecting: 'conectando…',
  disconnected: 'desconectada',
  error: 'error',
};

export function DeliveryPage() {
  const { orderId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scaleStatus, setScaleStatus] = useState<string>('disconnected');

  const { data: order, isLoading } = useQuery({
    queryKey: ['production', orderId],
    queryFn: () => productionApi.get(orderId),
    enabled: !!orderId,
  });

  // `bodega` no tiene permiso settings:read (es un módulo de administración);
  // si falla, se usan los valores por defecto (mismos del seed) sin bloquear la báscula.
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
    retry: false,
  });
  const stableSamples = settings?.stableSamples ?? DEFAULTS.stableSamples;
  const stableDeltaKg = settings?.stableDeltaKg ?? DEFAULTS.stableDeltaKg;

  const scale = useMemo(
    () => (IS_SIMULATOR ? new ScaleService(new SimulatorDriver(), { stableSamples, stableDeltaKg }) : null),
    [stableSamples, stableDeltaKg],
  );

  useEffect(() => {
    if (!scale) return;
    void scale.connect();
    return () => void scale.disconnect();
  }, [scale]);

  useEffect(() => {
    if (!scale) return;
    const poll = setInterval(() => setScaleStatus(scale.status), 200);
    return () => clearInterval(poll);
  }, [scale]);

  // F11: pantalla completa (mockup §4, atajo compartido con Cocina).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const requirements = order?.requirements ?? [];
  const pendingRequirements = requirements.filter((r) => r.status !== 'DELIVERED');
  const deliveredCount = requirements.length - pendingRequirements.length;

  const selected: Requirement | null =
    requirements.find((r) => r.id === selectedId) ?? pendingRequirements[0] ?? null;

  useEffect(() => {
    if (!selectedId && pendingRequirements[0]) setSelectedId(pendingRequirements[0].id);
  }, [selectedId, pendingRequirements]);

  useEffect(() => {
    // Al completar el requirement seleccionado, salta automáticamente al siguiente pendiente.
    if (selected && selected.status === 'DELIVERED') {
      const next = pendingRequirements.find((r) => r.id !== selected.id);
      setSelectedId(next?.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  if (isLoading || !order) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background">
        <p className="text-sm text-muted-foreground">Cargando orden…</p>
      </div>
    );
  }

  if (order.status === 'DELIVERED' || requirements.length === 0) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background text-center">
        <Scale className="size-10 text-primary" />
        <h1 className="text-xl font-semibold">{order.orderNumber} — entrega completa</h1>
        <p className="text-sm text-muted-foreground">Todos los insumos fueron entregados.</p>
        <Button onClick={() => navigate('/bodega')}>Volver a órdenes</Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center gap-4 border-b bg-card px-6 py-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/bodega')} aria-label="Volver">
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="tnum text-lg font-semibold">Orden del día · {order.orderNumber}</h1>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-2 w-40 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${requirements.length ? (deliveredCount / requirements.length) * 100 : 0}%` }}
              />
            </div>
            <span className="tnum text-xs text-muted-foreground">
              {deliveredCount}/{requirements.length} insumos
            </span>
          </div>
        </div>
        <span className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          <Scale className="size-4" />
          báscula: {IS_SIMULATOR ? SCALE_STATUS_LABEL[scaleStatus] : 'sin configurar'}
        </span>
      </header>

      <div className="grid flex-1 grid-cols-[minmax(0,320px)_1fr] overflow-hidden">
        <aside className="overflow-y-auto border-r bg-card">
          {requirements.map((r) => {
            const Icon = REQUIREMENT_ICON[r.status];
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedId(r.id)}
                className={cn(
                  'flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-accent',
                  selected?.id === r.id && 'bg-accent',
                )}
              >
                <Icon className={cn('size-4 shrink-0', REQUIREMENT_ICON_CLASS[r.status])} />
                <span className="flex-1 truncate text-sm">{r.productName}</span>
                <span className="tnum text-xs text-muted-foreground">
                  {formatQty(r.deliveredQuantity)}/{formatQty(r.requiredQuantity)} {r.unitAbbreviation}
                </span>
              </button>
            );
          })}
        </aside>

        <main className="flex overflow-y-auto">
          {selected ? (
            <DeliveryWeighPanel
              orderId={orderId}
              requirement={selected}
              scale={scale}
              stableSamples={stableSamples}
              stableDeltaKg={stableDeltaKg}
              scaleSource={IS_SIMULATOR ? 'SIMULATOR' : 'SCALE'}
              onRegistered={() => void queryClient.invalidateQueries({ queryKey: ['production', orderId] })}
            />
          ) : (
            <div className="grid flex-1 place-items-center text-sm text-muted-foreground">
              Selecciona un insumo de la lista
            </div>
          )}
        </main>
      </div>

      {IS_SIMULATOR && <SimulatorPanel />}
    </div>
  );
}
