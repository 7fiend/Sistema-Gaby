import { PlugZap, Unplug, TriangleAlert } from 'lucide-react';
import { useSimulatorStore } from './simulatorStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Panel flotante del simulador (docs/02 §6): permite fijar el peso objetivo,
 * la fluctuación y forzar desconexión/error — solo se monta con
 * `VITE_SCALE_DRIVER=simulator` (no existe hardware real en esta fase).
 */
export function SimulatorPanel() {
  const { targetWeightKg, fluctuationPct, forcedStatus, setTarget, setFluctuation, setForcedStatus } =
    useSimulatorStore();

  return (
    <div className="fixed bottom-4 right-4 z-50 w-64 rounded-lg border bg-card p-3 text-sm shadow-lg">
      <p className="mb-2 flex items-center gap-1.5 font-semibold">
        <TriangleAlert className="size-3.5 text-warning" /> Simulador de báscula
      </p>
      <div className="mb-2 flex flex-col gap-1">
        <Label htmlFor="sim-target" className="text-xs text-muted-foreground">
          Peso objetivo (kg)
        </Label>
        <Input
          id="sim-target"
          type="number"
          step="0.001"
          min={0}
          value={targetWeightKg}
          onChange={(e) => setTarget(Number(e.target.value))}
          className="h-8"
        />
      </div>
      <div className="mb-3 flex flex-col gap-1">
        <Label htmlFor="sim-fluctuation" className="text-xs text-muted-foreground">
          Fluctuación (± {fluctuationPct.toFixed(1)} %)
        </Label>
        <input
          id="sim-fluctuation"
          type="range"
          min={0}
          max={5}
          step={0.1}
          value={fluctuationPct}
          onChange={(e) => setFluctuation(Number(e.target.value))}
          className="w-full accent-primary"
        />
      </div>
      <div className="flex gap-1.5">
        <Button
          type="button"
          size="sm"
          variant={forcedStatus === 'disconnected' ? 'default' : 'outline'}
          className="flex-1"
          onClick={() => setForcedStatus(forcedStatus === 'disconnected' ? null : 'disconnected')}
        >
          <Unplug className="size-3.5" /> Desconectar
        </Button>
        <Button
          type="button"
          size="sm"
          variant={forcedStatus === 'error' ? 'destructive' : 'outline'}
          className="flex-1"
          onClick={() => setForcedStatus(forcedStatus === 'error' ? null : 'error')}
        >
          Error
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setForcedStatus(null)}
          aria-label="Reconectar"
        >
          <PlugZap className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
