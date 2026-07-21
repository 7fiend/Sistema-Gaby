import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { TriangleAlert } from 'lucide-react';
import type { Requirement } from '@/features/production/api';
import { deliveryApi, type DeliveryRegisterResponse } from './api';
import type { ScaleService } from '@/services/scale/ScaleService';
import { useScaleReading } from '@/services/scale/useScaleReading';
import { formatWeight, formatQty, cn } from '@/lib/utils';
import { ApiRequestError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { CountStepper } from './CountStepper';

interface DeliveryWeighPanelProps {
  orderId: string;
  requirement: Requirement;
  scale: ScaleService | null;
  stableSamples: number;
  stableDeltaKg: number;
  scaleSource: 'SCALE' | 'SIMULATOR';
  onRegistered: (resp: DeliveryRegisterResponse) => void;
}

/** Panel de pesaje derecho (mockup §3.2): número vivo 96px, tolerancia, confirmación. */
export function DeliveryWeighPanel({
  orderId,
  requirement,
  scale,
  stableSamples,
  stableDeltaKg,
  scaleSource,
  onRegistered,
}: DeliveryWeighPanelProps) {
  const pending = Math.max(0, requirement.requiredQuantity - requirement.deliveredQuantity);
  const [countValue, setCountValue] = useState(0);
  const [blockedBanner, setBlockedBanner] = useState<{ deltaKg: number } | null>(null);

  useEffect(() => {
    setCountValue(0);
    setBlockedBanner(null);
  }, [requirement.id]);

  const { reading, isStable, color, status } = useScaleReading(requirement.isWeighable ? scale : null, {
    stableSamples,
    stableDeltaKg,
    pending,
    toleranceKg: requirement.toleranceApplied,
  });

  const mutation = useMutation({
    mutationFn: (input: { quantity: number; mode: 'complete' | 'partial' }) =>
      deliveryApi.register(orderId, requirement.id, {
        quantity: input.quantity,
        mode: input.mode,
        source: requirement.isWeighable ? scaleSource : 'COUNT',
        readings: requirement.isWeighable && reading ? [reading] : [],
      }),
    onSuccess: (resp) => {
      setBlockedBanner(resp.approved ? null : { deltaKg: resp.deltaKg });
      if (resp.approved) toast.success('Entrega registrada');
      onRegistered(resp);
    },
    onError: (e) => toast.error(e instanceof ApiRequestError ? e.message : 'Error al registrar la entrega'),
  });

  const canConfirmComplete = requirement.isWeighable
    ? color === 'green' && !mutation.isPending
    : countValue > 0 && !mutation.isPending;

  const canConfirmPartial = requirement.isWeighable
    ? isStable && !!reading && reading.weightKg > 0 && !mutation.isPending
    : countValue > 0 && countValue < pending && !mutation.isPending;

  const confirmComplete = () => {
    if (!canConfirmComplete) return;
    const quantity = requirement.isWeighable ? (reading?.weightKg ?? 0) : countValue;
    mutation.mutate({ quantity, mode: 'complete' });
  };

  const confirmPartial = () => {
    if (!canConfirmPartial) return;
    const quantity = requirement.isWeighable ? (reading?.weightKg ?? 0) : countValue;
    mutation.mutate({ quantity, mode: 'partial' });
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (e.code === 'Space') {
        e.preventDefault();
        confirmComplete();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canConfirmComplete, reading, countValue]);

  const colorClass =
    color === 'green' ? 'text-primary' : color === 'red' ? 'text-destructive' : 'text-muted-foreground';

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div>
        <h2 className="text-lg font-semibold">{requirement.productName}</h2>
        <p className="tnum text-sm text-muted-foreground">
          Requerido: {formatQty(pending)} {requirement.unitAbbreviation}
        </p>
      </div>

      {requirement.isWeighable ? (
        <>
          <div
            className={cn('tnum font-bold leading-none transition-colors', colorClass)}
            style={{ fontSize: '96px' }}
            aria-live="polite"
          >
            {reading ? (
              <>
                {formatWeight(reading.weightKg, 3).replace(/\s*kg$/, '')}
                <span className="ml-2 text-3xl align-baseline">kg</span>
              </>
            ) : (
              '—'
            )}
          </div>
          <p className={cn('text-sm font-medium', colorClass)}>
            {status !== 'connected'
              ? 'Báscula desconectada'
              : !reading
                ? 'Sin lectura'
                : !isStable
                  ? 'Estabilizando…'
                  : color === 'green'
                    ? 'ESTABLE'
                    : 'FUERA DE TOLERANCIA'}
          </p>
          <p className="text-sm text-muted-foreground">
            Tolerancia: ±{formatWeight(requirement.toleranceApplied)}
          </p>
        </>
      ) : (
        <CountStepper value={countValue} onChange={setCountValue} max={Math.ceil(pending)} />
      )}

      {blockedBanner && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          <TriangleAlert className="size-4 shrink-0" />
          {blockedBanner.deltaKg < 0
            ? `Faltan ${formatWeight(Math.abs(blockedBanner.deltaKg))}`
            : `Sobran ${formatWeight(Math.abs(blockedBanner.deltaKg))}`}
        </div>
      )}

      <Button
        size="lg"
        className="h-16 w-full max-w-sm text-base"
        disabled={!canConfirmComplete}
        onClick={confirmComplete}
      >
        CONFIRMAR ENTREGA <span className="text-xs opacity-70">(Espacio)</span>
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={!canConfirmPartial}
        onClick={confirmPartial}
      >
        Registrar entrega parcial
      </Button>
    </div>
  );
}
