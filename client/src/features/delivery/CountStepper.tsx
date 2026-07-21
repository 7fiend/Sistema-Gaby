import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Conteo por unidad (RF-05.6, `isWeighable:false`): sin campo de texto libre,
 * solo incrementos/decrementos — visualmente distinto del panel de báscula.
 */
export function CountStepper({
  value,
  onChange,
  max,
}: {
  value: number;
  onChange: (next: number) => void;
  max: number;
}) {
  return (
    <div className="flex items-center gap-4">
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={value <= 0}
        aria-label="Restar uno"
      >
        <Minus className="size-5" />
      </Button>
      <span className="tnum min-w-24 text-center text-5xl font-semibold">{value}</span>
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="Sumar uno"
      >
        <Plus className="size-5" />
      </Button>
    </div>
  );
}
